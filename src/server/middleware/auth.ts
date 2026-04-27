import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type ProtectedHeaderParameters,
} from "jose"
import { config } from "../../utils/config"
import {
  extractSetCookie,
  getSessionIdFromRequest,
  queueSessionCookieClear,
  queueSessionCookieSet,
} from "../sessionCookie"

export interface AuthUser {
  id: string
  email: string
  nebulaUserId: string
}

export interface NebulaIdentity {
  id: string
  email: string
}

interface CachedProfile {
  user: AuthUser
  expiresAt: number
}

interface ProfileRow {
  id: string
  email: string | null
  nebula_user_id: string | null
}

interface AuthResolverDependencies {
  fetchFn: typeof fetch
  jwtVerifyFn: typeof jwtVerify
  decodeProtectedHeaderFn: typeof decodeProtectedHeader
  logger: Pick<typeof console, "warn">
  supabase: SupabaseClient
}

export interface AuthResolver {
  optionalAuth(req: Request): Promise<AuthUser | null>
  requireAuth(req: Request): Promise<AuthUser>
  resolveProfileByNebulaIdentity(nebula: NebulaIdentity): Promise<AuthUser>
}

type SupabaseModule = typeof import("../db/supabase")

// HS256 secret for in-flight access tokens still signed by Nebula's pre-RS256
// issuance path. Optional: once Nebula stops issuing HS256 access tokens (post
// phase 4), this can be dropped along with the env injection. RS256 verifies
// against the JWKS keyring below.
const NEBULA_SECRET_KEY = process.env.NEBULA_SECRET_KEY
const JWT_SECRET: Uint8Array | null = NEBULA_SECRET_KEY
  ? new TextEncoder().encode(NEBULA_SECRET_KEY)
  : null
if (!JWT_SECRET) {
  console.warn(
    "[auth] NEBULA_SECRET_KEY not set; HS256 bearer tokens will be rejected. " +
      "RS256 tokens still verify via the JWKS endpoint."
  )
}

// Lazy-initialised JWKS resolver. createRemoteJWKSet caches keys in-process
// and refreshes on cooldown, so steady-state verification is local.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(config.nebulaJwksUrl), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60 * 1000,
    })
  }
  return cachedJwks
}

// Profile cache: avoids a Supabase DB round trip on every authenticated request.
// Entries expire after 30 seconds; expired entries are purged opportunistically.
const PROFILE_CACHE_TTL_MS = 30_000
const PROFILE_CACHE_MAX_SIZE = 10_000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function buildAuthUser(profileId: string, nebula: NebulaIdentity): AuthUser {
  return {
    id: profileId,
    email: nebula.email,
    nebulaUserId: nebula.id,
  }
}

function extractNebulaIdentityFromJwtPayload(payload: JWTPayload): NebulaIdentity | null {
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return null
  }
  return {
    id: payload.sub,
    email: normalizeEmail(payload.email),
  }
}

function extractNebulaIdentity(payload: any): NebulaIdentity | null {
  const result = payload?.results ?? payload
  const user = result?.user ?? result
  if (typeof user?.id !== "string" || typeof user?.email !== "string") {
    return null
  }
  return {
    id: user.id,
    email: normalizeEmail(user.email),
  }
}

function getSupabase(): SupabaseClient {
  const supabaseModule = require("../db/supabase") as SupabaseModule
  return supabaseModule.supabase
}

function isProfileConflictError(
  error: Pick<PostgrestError, "code" | "details" | "message">
): boolean {
  const details = error.details?.toLowerCase() ?? ""
  const message = error.message?.toLowerCase() ?? ""
  return (
    error.code === "23505" ||
    details.includes("duplicate") ||
    details.includes("already exists") ||
    message.includes("duplicate")
  )
}

function toProfileWriteAuthError(error: PostgrestError, fallbackMessage: string): AuthError {
  if (isProfileConflictError(error)) {
    return new AuthError("Profile mapping conflict", 409)
  }
  return new AuthError(fallbackMessage, 500)
}

export function createAuthResolver(
  overrides: Partial<AuthResolverDependencies> = {}
): AuthResolver {
  const fetchFn = overrides.fetchFn ?? fetch
  const jwtVerifyFn = overrides.jwtVerifyFn ?? jwtVerify
  const decodeProtectedHeaderFn =
    overrides.decodeProtectedHeaderFn ?? decodeProtectedHeader
  const logger = overrides.logger ?? console
  const supabase = overrides.supabase ?? getSupabase()
  const profileCache = new Map<string, CachedProfile>()
  let lastPurge = Date.now()

  function cacheProfile(user: AuthUser): AuthUser {
    profileCache.set(user.nebulaUserId, {
      user,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    })
    return user
  }

  function purgeExpiredProfiles() {
    const now = Date.now()
    if (now - lastPurge < 60_000) return

    lastPurge = now
    for (const [key, entry] of profileCache) {
      if (entry.expiresAt <= now) profileCache.delete(key)
    }
    if (profileCache.size > PROFILE_CACHE_MAX_SIZE) {
      profileCache.clear()
    }
  }

  async function loadProfileRows(
    applyFilter: (query: any) => any,
    conflictMessage: string
  ): Promise<ProfileRow[]> {
    const query = applyFilter(supabase.from("profiles").select("id, email, nebula_user_id")).limit(
      2
    )
    const { data, error } = await query

    if (error) {
      throw new AuthError("Failed to load user profile", 500)
    }

    const profiles = (data as ProfileRow[] | null) ?? []
    if (profiles.length > 1) {
      throw new AuthError(conflictMessage, 409)
    }

    return profiles
  }

  async function findProfileByNebulaUserId(nebulaUserId: string): Promise<ProfileRow | null> {
    const profiles = await loadProfileRows(
      (query) => query.eq("nebula_user_id", nebulaUserId),
      "Profile mapping conflict"
    )
    return profiles[0] ?? null
  }

  async function syncLinkedProfileEmail(profileId: string, nebula: NebulaIdentity): Promise<void> {
    const { error } = await supabase
      .from("profiles")
      .update({
        email: nebula.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)

    if (!error) {
      return
    }

    const authError = toProfileWriteAuthError(error, "Failed to sync user profile")
    if (authError.status === 409) {
      throw authError
    }

    logger.warn(
      `Failed to sync Observatory profile email for Nebula user ${nebula.id}: ${error.message}`
    )
  }

  async function resolveProfileByNebulaIdentity(nebula: NebulaIdentity): Promise<AuthUser> {
    purgeExpiredProfiles()
    const cached = profileCache.get(nebula.id)
    if (cached && cached.expiresAt > Date.now() && cached.user.email === nebula.email) {
      return cached.user
    }

    const linkedProfile = await findProfileByNebulaUserId(nebula.id)
    if (linkedProfile?.id) {
      if (linkedProfile.email !== nebula.email) {
        await syncLinkedProfileEmail(linkedProfile.id, nebula)
      }
      return cacheProfile(buildAuthUser(linkedProfile.id, nebula))
    }

    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        display_name: nebula.email.split("@")[0],
        email: nebula.email,
        nebula_user_id: nebula.id,
      })
      .select("id")
      .single()

    if (insertError || !newProfile) {
      const retryLinked = await findProfileByNebulaUserId(nebula.id)
      if (retryLinked?.id) {
        return cacheProfile(buildAuthUser(retryLinked.id, nebula))
      }

      if (insertError) {
        throw toProfileWriteAuthError(insertError, "Failed to resolve user profile")
      }
      throw new AuthError("Failed to resolve user profile", 500)
    }

    return cacheProfile(buildAuthUser(newProfile.id as string, nebula))
  }

  async function resolveNebulaIdentityFromSession(
    req: Request,
    sessionId: string
  ): Promise<NebulaIdentity> {
    let resp: Response

    try {
      resp = await fetchFn(`${config.nebulaBaseUrl}/v1/users/session`, {
        headers: {
          Cookie: `nebula_session=${encodeURIComponent(sessionId)}`,
        },
      })
    } catch {
      throw new AuthError("Authentication service unavailable", 503)
    }

    const data = await resp.json().catch(() => null)

    if (!resp.ok) {
      const detail = data?.detail || data?.message
      if (resp.status === 401 || resp.status === 403) {
        queueSessionCookieClear(req)
        throw new AuthError(detail || "Invalid or expired session", 401)
      }
      if (resp.status >= 500) {
        throw new AuthError(detail || "Authentication service unavailable", 503)
      }
      throw new AuthError(detail || "Authentication service misconfigured", 502)
    }

    const nebulaSessionCookie = extractSetCookie(resp.headers, "nebula_session")
    if (nebulaSessionCookie) {
      if (nebulaSessionCookie.maxAge === 0 || !nebulaSessionCookie.value) {
        queueSessionCookieClear(req)
      } else {
        queueSessionCookieSet(req, nebulaSessionCookie.value, nebulaSessionCookie.maxAge)
      }
    }

    const result = data?.results ?? data
    const nebulaIdentity = extractNebulaIdentity(data)

    if (!result?.active || !nebulaIdentity) {
      queueSessionCookieClear(req)
      throw new AuthError("Invalid or expired session", 401)
    }

    return nebulaIdentity
  }

  async function resolveNebulaIdentityFromBearerToken(
    payload: JWTPayload
  ): Promise<NebulaIdentity> {
    const jwtIdentity = extractNebulaIdentityFromJwtPayload(payload)
    if (jwtIdentity) {
      return jwtIdentity
    }
    throw new AuthError("Token missing subject or email claim", 401)
  }

  async function verifyBearerToken(token: string): Promise<JWTPayload> {
    // Disjoint algorithms=[...] allow-list per branch closes the classic
    // alg-confusion attack class -- a malicious alg header can't trick the
    // verifier into reusing the wrong key.
    let header: ProtectedHeaderParameters
    try {
      header = decodeProtectedHeaderFn(token)
    } catch {
      throw new AuthError("Invalid or expired token", 401)
    }

    if (header.alg === "RS256") {
      const { payload } = await jwtVerifyFn(token, getJwks(), {
        algorithms: ["RS256"],
      })
      return payload
    }
    if (header.alg === "HS256") {
      if (!JWT_SECRET) {
        throw new AuthError("HS256 verification not configured", 401)
      }
      const { payload } = await jwtVerifyFn(token, JWT_SECRET, {
        algorithms: ["HS256"],
      })
      return payload
    }
    throw new AuthError("Unsupported token algorithm", 401)
  }

  async function requireAuth(req: Request): Promise<AuthUser> {
    const authHeader = req.headers.get("authorization")
    let nebulaIdentity: NebulaIdentity

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7)
      try {
        const payload = await verifyBearerToken(token)

        if (payload.token_type && payload.token_type !== "access") {
          throw new AuthError("Invalid token type", 401)
        }

        if (typeof payload.sub !== "string" || !payload.sub) {
          throw new AuthError("Token missing subject claim", 401)
        }
        nebulaIdentity = await resolveNebulaIdentityFromBearerToken(payload)
      } catch (err) {
        if (err instanceof AuthError) throw err
        throw new AuthError("Invalid or expired token", 401)
      }
    } else {
      const sessionId = getSessionIdFromRequest(req)
      if (!sessionId) {
        throw new AuthError("Missing authentication", 401)
      }
      nebulaIdentity = await resolveNebulaIdentityFromSession(req, sessionId)
    }

    return resolveProfileByNebulaIdentity(nebulaIdentity)
  }

  async function optionalAuth(req: Request): Promise<AuthUser | null> {
    try {
      return await requireAuth(req)
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) {
        return null
      }
      throw err
    }
  }

  return {
    optionalAuth,
    requireAuth,
    resolveProfileByNebulaIdentity,
  }
}

let defaultAuthResolver: AuthResolver | null = null

function getDefaultAuthResolver(): AuthResolver {
  if (!defaultAuthResolver) {
    defaultAuthResolver = createAuthResolver()
  }
  return defaultAuthResolver
}

/**
 * Extract and verify a Nebula JWT from the Authorization header.
 *
 * Validates signature, expiry, and token_type (must be "access"), then resolves
 * the Nebula user id to an Observatory profile UUID via the signed subject/email claims.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  return getDefaultAuthResolver().requireAuth(req)
}

/**
 * Optionally extract user from the same auth sources as requireAuth.
 * Returns the user or null (for public GET endpoints).
 */
export async function optionalAuth(req: Request): Promise<AuthUser | null> {
  return getDefaultAuthResolver().optionalAuth(req)
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number = 401) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}
