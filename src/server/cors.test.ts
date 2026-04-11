import { describe, expect, test } from "bun:test"
import { applyResponseCorsHeaders, buildPreflightResponse } from "./cors"

describe("cors helpers", () => {
  test("merges Vary: Origin with existing response metadata", () => {
    const headers = new Headers({
      "Content-Type": "application/json",
      Vary: "Accept-Encoding",
    })

    applyResponseCorsHeaders(headers, "http://localhost:3003")

    expect(headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3003")
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(headers.get("Vary")).toBe("Accept-Encoding, Origin")
  })

  test("adds Vary: Origin for disallowed origins without exposing CORS headers", () => {
    const headers = new Headers()

    applyResponseCorsHeaders(headers, "https://evil.example")

    expect(headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(headers.get("Access-Control-Allow-Credentials")).toBeNull()
    expect(headers.get("Vary")).toBe("Origin")
  })

  test("does not duplicate Origin in Vary for normal responses", () => {
    const headers = new Headers({ Vary: "Origin" })

    applyResponseCorsHeaders(headers, "http://localhost:3003")

    expect(headers.get("Vary")).toBe("Origin")
  })

  test("builds preflight responses with the additional allow metadata", async () => {
    const response = buildPreflightResponse("http://localhost:3003")

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3003")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    )
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization, X-Requested-With, Baggage, Sentry-Trace"
    )
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400")
    expect(response.headers.get("Vary")).toBe("Origin")
    expect(await response.text()).toBe("")
  })
})
