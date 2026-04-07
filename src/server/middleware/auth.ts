import { jwtVerify } from "jose"

export interface AuthUser {
  id: string
  email: string
}

// Nebula JWT secret -- same key the backend uses to sign tokens.
// Fail fast at startup if missing, rather than silently rejecting all tokens.
const NEBULA_SECRET_KEY = process.env.NEBULA_SECRET_KEY
if (!NEBULA_SECRET_KEY) {
  throw new Error(
    "Missing required environment variable: NEBULA_SECRET_KEY must be set for JWT verification."
  )
}
const JWT_SECRET = new TextEncoder().encode(NEBULA_SECRET_KEY)

/**
 * Extract and verify a Nebula JWT from the Authorization header.
 *
 * Validates signature, expiry, and token_type (must be "access").
 * Resolves the Nebula email to an Observatory profile UUID so
 * downstream queries against profiles/runs/api_keys work correctly.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401)
  }

  const token = authHeader.slice(7)

  let email: string
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    })

    // Reject refresh tokens used as bearer auth
    if (payload.token_type && payload.token_type !== "access") {
      throw new AuthError("Invalid token type", 401)
    }

    email = payload.sub as string
    if (!email) {
      throw new AuthError("Token missing subject claim", 401)
    }
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError("Invalid or expired token", 401)
  }

  // Resolve email to Observatory profile UUID.
  // Observatory stores profiles with Supabase UUIDs as primary keys.
  // Look up by email to bridge the ID gap.
  const { supabase } = require("../db/supabase")
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  if (profile?.id) {
    return { id: profile.id, email }
  }

  // No profile found -- auto-provision one for this Nebula user.
  // Use the email as display_name initially.
  const { data: newProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      display_name: email.split("@")[0],
      email,
    })
    .select("id")
    .single()

  if (insertError || !newProfile) {
    // May race with concurrent request -- try fetching again
    const { data: retry } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (retry?.id) {
      return { id: retry.id, email }
    }

    throw new AuthError("Failed to resolve user profile", 500)
  }

  return { id: newProfile.id, email }
}

/**
 * Optionally extract user from Authorization header.
 * Returns the user or null (for public GET endpoints).
 */
export async function optionalAuth(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null
  }

  try {
    return await requireAuth(req)
  } catch {
    return null
  }
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number = 401) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}
