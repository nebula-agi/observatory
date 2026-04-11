import { describe, expect, test } from "bun:test"
import { applyCorsHeaders, createCorsHeaders } from "./cors"

describe("cors helpers", () => {
  test("merges Vary: Origin with existing response metadata", () => {
    const headers = new Headers({
      "Content-Type": "application/json",
      Vary: "Accept-Encoding",
    })

    applyCorsHeaders(headers, "http://localhost:3003")

    expect(headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3003")
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(headers.get("Vary")).toBe("Accept-Encoding, Origin")
  })

  test("adds Vary: Origin for disallowed origins without exposing CORS headers", () => {
    const headers = new Headers()

    applyCorsHeaders(headers, "https://evil.example")

    expect(headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(headers.get("Access-Control-Allow-Credentials")).toBeNull()
    expect(headers.get("Vary")).toBe("Origin")
  })

  test("does not duplicate Origin in Vary and supports preflight header creation", () => {
    const headers = createCorsHeaders("http://localhost:3003")
    headers.set("Vary", "Origin")

    applyCorsHeaders(headers, "http://localhost:3003")

    expect(headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    )
    expect(headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization, X-Requested-With, Baggage, Sentry-Trace"
    )
    expect(headers.get("Access-Control-Max-Age")).toBe("86400")
    expect(headers.get("Vary")).toBe("Origin")
  })
})
