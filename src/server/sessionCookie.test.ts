import { describe, expect, test } from "bun:test"
import { extractSetCookie } from "./sessionCookie"

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
})
