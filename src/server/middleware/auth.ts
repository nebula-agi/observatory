import { jwtVerify } from "jose"
import { config } from "../../utils/config"

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
const OBSERVATORY_SESSION_COOKIE = "observatory_session"

// Profile cache: avoids a Supabase DB round trip on every authenticated request.
// Entries expire after 30 seconds; expired entries are purged opportunistically.
const PROFILE_CACHE_TTL_MS = 30_000
const PROFILE_CACHE_MAX_SIZE = 10_000
const profileCache = new Map<string, { user: AuthUser; expiresAt: number }>()
let lastPurge = Date.now()

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function resolveProfileByEmail(email: string): Promise<AuthUser> {
  purgeExpiredProfiles()
  const cached = profileCache.get(email)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user
  }

  const { supabase } = require("../db/supabase")
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  if (profile?.id) {
    const user = { id: profile.id, email }
    profileCache.set(email, { user, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
    return user
  }

  const { data: newProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      display_name: email.split("@")[0],
      email,
    })
    .select("id")
    .single()

  if (insertError || !newProfile) {
    const { data: retry } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (retry?.id) {
      const user = { id: retry.id, email }
      profileCache.set(email, { user, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
      return user
    }

    throw new AuthError("Failed to resolve user profile", 500)
  }

  const user = { id: newProfile.id, email }
  profileCache.set(email, { user, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
  return user
}

async function resolveEmailFromNebulaSession(sessionId: string): Promise<string> {
  const resp = await fetch(`${config.nebulaBaseUrl}/v1/users/session`, {
    headers: {
      Cookie: `nebula_session=${encodeURIComponent(sessionId)}`,
    },
  })

  if (!resp.ok) {
    throw new AuthError("Invalid or expired session", 401)
  }

  const data = await resp.json().catch(() => null)
  const result = data?.results ?? data
  const email = result?.user?.email

  if (!result?.active || !email) {
    throw new AuthError("Invalid or expired session", 401)
  }

  return email
}

function purgeExpiredProfiles() {
  const now = Date.now()
  // Purge at most once every 60 seconds
  if (now - lastPurge < 60_000) return
  lastPurge = now
  for (const [key, entry] of profileCache) {
    if (entry.expiresAt <= now) profileCache.delete(key)
  }
  // Hard cap: if still too large, clear entirely
  if (profileCache.size > PROFILE_CACHE_MAX_SIZE) profileCache.clear()
}

/**
 * Extract and verify a Nebula JWT from the Authorization header.
 *
 * Validates signature, expiry, and token_type (must be "access").
 * Resolves the Nebula email to an Observatory profile UUID so
 * downstream queries against profiles/runs/api_keys work correctly.
 * Results are cached for 30s per email to avoid per-request DB lookups.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization")
  let email: string

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, {
        algorithms: ["HS256"],
      })

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
  } else {
    const sessionId = getCookie(req, OBSERVATORY_SESSION_COOKIE)
    if (!sessionId) {
      throw new AuthError("Missing authentication", 401)
    }
    email = await resolveEmailFromNebulaSession(sessionId)
  }

  return resolveProfileByEmail(email)
}

/**
 * Optionally extract user from the same auth sources as requireAuth.
 * Returns the user or null (for public GET endpoints).
 */
export async function optionalAuth(req: Request): Promise<AuthUser | null> {
  try {
    return await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) {
      return null
    }
    throw err
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
