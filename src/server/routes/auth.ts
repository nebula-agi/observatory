import { requireAuth, AuthError } from "../middleware/auth"
import {
  getUserApiKey,
  setUserApiKey,
  deleteUserApiKey,
  listUserApiKeyNames,
  isValidKeyName,
} from "../services/apiKeys"
import { config } from "../../utils/config"
import {
  clearSessionCookie,
  extractSetCookie,
  getSessionIdFromRequest,
  setSessionCookie,
} from "../sessionCookie"

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const NEBULA_API = `${config.nebulaBaseUrl}/v1`

function normalizeOAuthReturnUrl(returnUrl: unknown, requestUrl: URL): string {
  if (typeof returnUrl !== "string" || !returnUrl) {
    return "/leaderboard"
  }

  if (returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    return returnUrl
  }

  try {
    const parsed = new URL(returnUrl)
    if (parsed.origin !== requestUrl.origin) {
      return "/leaderboard"
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/leaderboard"
  } catch {
    return "/leaderboard"
  }
}

export async function handleAuthRoutes(req: Request, url: URL): Promise<Response | null> {
  const method = req.method
  const pathname = url.pathname

  const supabase = require("../db/supabase").supabase

  // POST /api/auth/signup -- proxy to Nebula backend
  if (method === "POST" && pathname === "/api/auth/signup") {
    try {
      const body = await req.json()
      const { email, password, displayName } = body

      if (!email || !password) {
        return json({ error: "Email and password are required" }, 400)
      }

      const { captchaToken } = body
      const resp = await fetch(`${NEBULA_API}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: displayName, captcha_token: captchaToken }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        return json({ error: err.detail || err.message || "Signup failed" }, resp.status)
      }

      return json({
        message: "Account created. Please check your email for a verification code.",
        needsVerification: true,
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/verify-email -- proxy to Nebula
  if (method === "POST" && pathname === "/api/auth/verify-email") {
    try {
      const body = await req.json()
      const { email, verificationCode } = body

      if (!email || !verificationCode) {
        return json({ error: "Email and verification code are required" }, 400)
      }

      const resp = await fetch(`${NEBULA_API}/users/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verification_code: verificationCode }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        return json({ error: err.detail || err.message || "Verification failed" }, resp.status)
      }

      return json({ message: "Email verified! You can now sign in." })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/login -- create an Observatory cookie session backed by Nebula
  if (method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await req.json()
      const { email, password } = body

      if (!email || !password) {
        return json({ error: "Email and password are required" }, 400)
      }

      const { captchaToken } = body
      const params: Record<string, string> = { username: email, password }
      if (captchaToken) params.captcha_token = captchaToken
      const resp = await fetch(`${NEBULA_API}/users/session/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        return json({ error: err.detail || err.message || "Login failed" }, resp.status)
      }

      const sessionCookie = extractSetCookie(resp.headers, "nebula_session")
      if (!sessionCookie?.value) {
        return json({ error: "Login succeeded but no session cookie was returned" }, 502)
      }

      const headers = new Headers({ "Content-Type": "application/json" })
      setSessionCookie(headers, req, sessionCookie.value, sessionCookie.maxAge)
      return new Response(JSON.stringify({ message: "Logged in" }), {
        status: 200,
        headers,
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/oauth/exchange -- exchange OAuth code into Observatory cookie session
  if (method === "POST" && pathname === "/api/auth/oauth/exchange") {
    try {
      const body = await req.json()
      const { code } = body
      if (!code) {
        return json({ error: "Missing OAuth code" }, 400)
      }

      const resp = await fetch(`${NEBULA_API}/users/session/oauth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })

      const data = await resp.json().catch(() => null)

      if (!resp.ok) {
        return json(
          { error: data?.detail || data?.message || "OAuth exchange failed" },
          resp.status
        )
      }

      const sessionCookie = extractSetCookie(resp.headers, "nebula_session")
      if (!sessionCookie?.value) {
        return json({ error: "OAuth exchange succeeded but no session cookie was returned" }, 502)
      }

      const returnUrl = normalizeOAuthReturnUrl(data?.results?.return_url ?? data?.return_url, url)

      const headers = new Headers({ "Content-Type": "application/json" })
      setSessionCookie(headers, req, sessionCookie.value, sessionCookie.maxAge)
      return new Response(JSON.stringify({ return_url: returnUrl }), {
        status: 200,
        headers,
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/logout -- forward to Nebula to revoke session, then clear Observatory cookie
  if (method === "POST" && pathname === "/api/auth/logout") {
    const sessionId = getSessionIdFromRequest(req)
    if (sessionId) {
      try {
        await fetch(`${NEBULA_API}/users/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `nebula_session=${encodeURIComponent(sessionId)}`,
          },
        })
      } catch {
        /* best-effort */
      }
    }
    const headers = new Headers({ "Content-Type": "application/json" })
    clearSessionCookie(headers, req)
    return new Response(JSON.stringify({ message: "Logged out" }), {
      status: 200,
      headers,
    })
  }

  // GET /api/auth/session
  if (method === "GET" && pathname === "/api/auth/session") {
    try {
      const user = await requireAuth(req)

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      return json({
        id: user.id,
        email: user.email,
        displayName: profile?.display_name || user.email.split("@")[0],
        avatarUrl: profile?.avatar_url || null,
        active: true,
      })
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) {
        return json({ active: false, user: null })
      }
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: "Authentication service unavailable" }, 503)
    }
  }

  // PUT /api/auth/profile
  if (method === "PUT" && pathname === "/api/auth/profile") {
    try {
      const user = await requireAuth(req)
      const body = await req.json()
      const { displayName, avatarUrl } = body

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (displayName !== undefined) updates.display_name = displayName
      if (avatarUrl !== undefined) updates.avatar_url = avatarUrl

      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id)

      if (error) {
        return json({ error: error.message }, 500)
      }

      return json({ message: "Profile updated" })
    } catch (e) {
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: "Unauthorized" }, 401)
    }
  }

  // GET /api/auth/keys - list key names only
  if (method === "GET" && pathname === "/api/auth/keys") {
    try {
      const user = await requireAuth(req)
      const keyNames = await listUserApiKeyNames(user.id)
      return json({ keys: keyNames })
    } catch (e) {
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: "Unauthorized" }, 401)
    }
  }

  // PUT /api/auth/keys/:name - set/update key
  const keySetMatch = pathname.match(/^\/api\/auth\/keys\/([^/]+)$/)
  if (method === "PUT" && keySetMatch) {
    try {
      const user = await requireAuth(req)
      const keyName = decodeURIComponent(keySetMatch[1])

      if (!isValidKeyName(keyName)) {
        return json(
          {
            error: `Invalid key name: ${keyName}. Valid: supermemory, mem0, zep, nebula, openai, anthropic, google`,
          },
          400
        )
      }

      const body = await req.json()
      const { value } = body

      if (!value || typeof value !== "string") {
        return json({ error: "Missing or invalid 'value' field" }, 400)
      }

      await setUserApiKey(user.id, keyName, value)
      return json({ message: `Key '${keyName}' saved` })
    } catch (e) {
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: e instanceof Error ? e.message : "Failed to save key" }, 500)
    }
  }

  // DELETE /api/auth/keys/:name - delete key
  const keyDeleteMatch = pathname.match(/^\/api\/auth\/keys\/([^/]+)$/)
  if (method === "DELETE" && keyDeleteMatch) {
    try {
      const user = await requireAuth(req)
      const keyName = decodeURIComponent(keyDeleteMatch[1])

      if (!isValidKeyName(keyName)) {
        return json({ error: `Invalid key name: ${keyName}` }, 400)
      }

      await deleteUserApiKey(user.id, keyName)
      return json({ message: `Key '${keyName}' deleted` })
    } catch (e) {
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: e instanceof Error ? e.message : "Failed to delete key" }, 500)
    }
  }

  return null
}
