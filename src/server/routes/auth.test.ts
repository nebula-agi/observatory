import { afterEach, describe, expect, test } from "bun:test"

process.env.NEBULA_SECRET_KEY = "test-secret"
process.env.SUPABASE_URL = "https://supabase.test"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key"

const { handleAuthRoutes } = await import("./auth")

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("handleAuthRoutes oauth exchange", () => {
  test("falls back to the default page when nebula returns an external return_url", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ return_url: "https://evil.example/phish" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "nebula_session=session-123; Path=/; Max-Age=3600; HttpOnly",
        },
      })) as unknown as typeof fetch

    const req = new Request("https://observatory.test/api/auth/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "oauth-code" }),
    })

    const response = await handleAuthRoutes(req, new URL(req.url))
    const data = await response?.json()

    expect(response?.status).toBe(200)
    expect(data).toEqual({ return_url: "/leaderboard" })
    expect(response?.headers.get("set-cookie")).toContain("observatory_session=session-123")
  })

  test("converts same-origin absolute return_url values into in-app paths", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          return_url: "https://observatory.test/runs/abc?view=mine#summary",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "nebula_session=session-123; Path=/; Max-Age=3600; HttpOnly",
          },
        }
      )) as unknown as typeof fetch

    const req = new Request("https://observatory.test/api/auth/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "oauth-code" }),
    })

    const response = await handleAuthRoutes(req, new URL(req.url))
    const data = await response?.json()

    expect(response?.status).toBe(200)
    expect(data).toEqual({ return_url: "/runs/abc?view=mine#summary" })
  })
})
