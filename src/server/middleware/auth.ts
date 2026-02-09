export interface AuthUser {
  id: string
  email: string
}

/**
 * Extract and verify JWT from Authorization header.
 * Returns the authenticated user or throws.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401)
  }

  const token = authHeader.slice(7)
  const { supabase } = require("../db/supabase")

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new AuthError("Invalid or expired token", 401)
  }

  return {
    id: user.id,
    email: user.email || "",
  }
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
