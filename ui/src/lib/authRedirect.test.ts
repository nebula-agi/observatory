import { describe, expect, test } from "bun:test"
import {
  consumeOAuthReturnPathFromStorage,
  normalizeInAppReturnPath,
  rememberOAuthReturnPathInStorage,
} from "./authRedirect"

function createFakeStorage() {
  const state = new Map<string, string>()

  return {
    storage: {
      getItem(key: string) {
        return state.get(key) ?? null
      },
      removeItem(key: string) {
        state.delete(key)
      },
      setItem(key: string, value: string) {
        state.set(key, value)
      },
    },
  }
}

describe("auth redirect helpers", () => {
  test("stores and consumes the intended in-app return path", () => {
    const { storage } = createFakeStorage()

    rememberOAuthReturnPathInStorage(storage, "/runs/abc?view=mine#summary")

    expect(consumeOAuthReturnPathFromStorage(storage)).toBe("/runs/abc?view=mine#summary")
    expect(consumeOAuthReturnPathFromStorage(storage)).toBeNull()
  })

  test("rejects non-relative return paths", () => {
    expect(normalizeInAppReturnPath("https://evil.example/phish")).toBeNull()
    expect(normalizeInAppReturnPath("//evil.example/phish")).toBeNull()
    expect(normalizeInAppReturnPath("runs/abc")).toBeNull()
  })

  test("does not persist the callback route itself", () => {
    const { storage } = createFakeStorage()

    rememberOAuthReturnPathInStorage(storage, "/auth/callback?code=test")

    expect(consumeOAuthReturnPathFromStorage(storage)).toBeNull()
  })
})
