import { requireAuth, AuthError } from "../middleware/auth"
import {
  getUserApiKey,
  setUserApiKey,
  deleteUserApiKey,
  listUserApiKeyNames,
  isValidKeyName,
} from "../services/apiKeys"

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function handleAuthRoutes(req: Request, url: URL): Promise<Response | null> {
  const method = req.method
  const pathname = url.pathname

  const supabase = require("../db/supabase").supabase

  // POST /api/auth/signup
  if (method === "POST" && pathname === "/api/auth/signup") {
    try {
      const body = await req.json()
      const { email, password, displayName } = body

      if (!email || !password) {
        return json({ error: "Email and password are required" }, 400)
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName || email.split("@")[0] },
      })

      if (error) {
        return json({ error: error.message }, 400)
      }

      // Create profile
      await supabase.from("profiles").insert({
        id: data.user.id,
        display_name: displayName || email.split("@")[0],
      })

      // Generate a session for the new user
      const { data: session, error: signInError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      })

      return json({
        user: {
          id: data.user.id,
          email: data.user.email,
          displayName: displayName || email.split("@")[0],
        },
        message: "Account created successfully",
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/login
  if (method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await req.json()
      const { email, password } = body

      if (!email || !password) {
        return json({ error: "Email and password are required" }, 400)
      }

      // Use service role to sign in on behalf of user
      // Note: In production, the client would use the anon key directly
      // This endpoint exists for the server-side flow
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      })

      if (error) {
        return json({ error: error.message }, 400)
      }

      return json({
        message: "Login link generated. In production, use the Supabase client-side auth directly.",
        // The client should use supabase.auth.signInWithPassword() directly
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request" }, 400)
    }
  }

  // POST /api/auth/logout
  if (method === "POST" && pathname === "/api/auth/logout") {
    // Server-side logout is a no-op — the client clears its session
    return json({ message: "Logged out" })
  }

  // GET /api/auth/me
  if (method === "GET" && pathname === "/api/auth/me") {
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
      })
    } catch (e) {
      if (e instanceof AuthError) {
        return json({ error: e.message }, e.status)
      }
      return json({ error: "Unauthorized" }, 401)
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

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)

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
