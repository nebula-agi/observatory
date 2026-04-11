import { describe, expect, test } from "bun:test"
import { extractCookieValue, extractSetCookie } from "./sessionCookie"

describe("extractCookieValue", () => {
  test("returns null for malformed cookie encoding", () => {
    expect(extractCookieValue("observatory_session=%zz", "observatory_session")).toBeNull()
  })
})

describe("extractSetCookie", () => {
  test("uses the matching cookie max-age when fallback headers are combined", () => {
    const headers = {
      get(name: string) {
        if (name.toLowerCase() !== "set-cookie") return null

        return [
          "other_cookie=one; Path=/; Max-Age=600",
          "nebula_session=nebula%20session; Path=/; HttpOnly; Max-Age=60",
        ].join(", ")
      },
    } as unknown as Headers

    expect(extractSetCookie(headers, "nebula_session")).toEqual({
      value: "nebula session",
      maxAge: 60,
    })
  })

  test("ignores malformed cookie values while scanning fallback headers", () => {
    const headers = {
      get(name: string) {
        if (name.toLowerCase() !== "set-cookie") return null

        return [
          "nebula_session=%zz; Path=/; HttpOnly; Max-Age=60",
          "nebula_session=valid%20session; Path=/; HttpOnly; Max-Age=120",
        ].join(", ")
      },
    } as unknown as Headers

    expect(extractSetCookie(headers, "nebula_session")).toEqual({
      value: "valid session",
      maxAge: 120,
    })
  })
})
