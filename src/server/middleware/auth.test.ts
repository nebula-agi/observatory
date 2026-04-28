import { describe, expect, test } from "bun:test"
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"
import type { JWTPayload, JWTVerifyResult } from "jose"

process.env.NEBULA_SECRET_KEY = "test-secret"

const { AuthError, createAuthResolver } = await import("./auth")

type TestProfileRow = {
  id: string
  display_name?: string
  email: string | null
  nebula_user_id: string | null
  updated_at?: string
}

type UpdateFilter = {
  column: string
  value: string
}

type FakeSupabaseState = {
  insertCalls: Array<Record<string, unknown>>
  profiles: TestProfileRow[]
  updateCalls: Array<{ filter: UpdateFilter; patch: Record<string, unknown> }>
}

type FakeSupabaseOptions = {
  onUpdate?: (
    patch: Record<string, unknown>,
    filter: UpdateFilter,
    state: FakeSupabaseState
  ) => PostgrestError | null
}

function createProfileConflictError(): PostgrestError {
  return {
    code: "23505",
    details: "duplicate key value violates unique constraint",
    hint: "",
    message: "duplicate key value violates unique constraint",
    name: "PostgrestError",
  }
}

function createJwtVerifyResult(payload: JWTPayload): JWTVerifyResult<JWTPayload> {
  return {
    payload,
    protectedHeader: { alg: "HS256" },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function ilikePatternToRegExp(pattern: string): RegExp {
  let regex = "^"

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === "\\") {
      index += 1
      if (index < pattern.length) {
        regex += escapeRegExp(pattern[index])
      } else {
        regex += "\\\\"
      }
      continue
    }
    if (char === "%") {
      regex += ".*"
      continue
    }
    if (char === "_") {
      regex += "."
      continue
    }
    regex += escapeRegExp(char)
  }

  regex += "$"
  return new RegExp(regex, "i")
}

function createFakeSupabase(
  initialProfiles: TestProfileRow[],
  options: FakeSupabaseOptions = {}
): { client: SupabaseClient; state: FakeSupabaseState } {
  const state: FakeSupabaseState = {
    insertCalls: [],
    profiles: initialProfiles.map((profile) => ({ ...profile })),
    updateCalls: [],
  }

  const client = {
    from(table: string) {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        insert(record: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  state.insertCalls.push(record)
                  const insertedProfile: TestProfileRow = {
                    id: (record.id as string | undefined) ?? crypto.randomUUID(),
                    display_name: record.display_name as string | undefined,
                    email: (record.email as string | null | undefined) ?? null,
                    nebula_user_id: (record.nebula_user_id as string | null | undefined) ?? null,
                  }
                  state.profiles.push(insertedProfile)
                  return {
                    data: { id: insertedProfile.id },
                    error: null,
                  }
                },
              }
            },
          }
        },
        select() {
          const filters: Array<(profile: TestProfileRow) => boolean> = []
          const query = {
            eq(column: string, value: string) {
              filters.push(
                (profile) => String((profile as Record<string, unknown>)[column] ?? "") === value
              )
              return query
            },
            ilike(column: string, value: string) {
              const regex = ilikePatternToRegExp(value)
              filters.push((profile) => {
                const profileValue = (profile as Record<string, unknown>)[column]
                return typeof profileValue === "string" && regex.test(profileValue)
              })
              return query
            },
            async limit(limit: number) {
              const data = state.profiles.filter((profile) =>
                filters.every((filter) => filter(profile))
              )
              return {
                data: data.slice(0, limit).map((profile) => ({ ...profile })),
                error: null,
              }
            },
          }
          return query
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              const filter = { column, value }
              state.updateCalls.push({ filter, patch })
              const error = options.onUpdate?.(patch, filter, state) ?? null
              if (!error) {
                for (const profile of state.profiles) {
                  if (String((profile as Record<string, unknown>)[column] ?? "") === value) {
                    Object.assign(profile, patch)
                  }
                }
              }
              return { error }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, state }
}

// Bearer-auth tests pass placeholder strings (not real JWTs) and mock
// jwtVerifyFn to return a chosen payload; the resolver also calls
// decodeProtectedHeader to dispatch by alg, so tests need a header mock too.
const mockHs256Header = (() => ({ alg: "HS256", typ: "JWT" })) as unknown as typeof import("jose").decodeProtectedHeader
// kid is dead data in tests (mocked jwtVerifyFn never reaches the JWKS
// resolver) but kept to match the real header shape.
const mockRs256Header = (() => ({ alg: "RS256", typ: "JWT", kid: "test-kid" })) as unknown as typeof import("jose").decodeProtectedHeader

describe("auth bridge profile resolution", () => {
  test("resolves bearer auth directly from the signed subject/email claims", async () => {
    const { client, state } = createFakeSupabase([
      {
        email: "actual@example.com",
        id: "profile-1",
        nebula_user_id: "nebula-user-1",
      },
    ])
    const resolver = createAuthResolver({
      fetchFn: (async () => {
        throw new Error("Bearer auth should resolve locally from signed claims")
      }) as unknown as typeof fetch,
      jwtVerifyFn: (async () =>
        createJwtVerifyResult({
          email: "actual@example.com",
          sub: "nebula-user-1",
          token_type: "access",
        })) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: mockHs256Header,
      logger: { warn() {} },
      supabase: client,
    })

    const user = await resolver.requireAuth(
      new Request("https://observatory.test/api/auth/session", {
        headers: {
          authorization: "Bearer test-token",
        },
      })
    )

    expect(user).toEqual({
      email: "actual@example.com",
      id: "profile-1",
      nebulaUserId: "nebula-user-1",
    })
    expect(state.profiles[0]).toMatchObject({
      email: "actual@example.com",
      id: "profile-1",
      nebula_user_id: "nebula-user-1",
    })
  })

  test("creates a new profile when no nebula_user_id-linked row exists", async () => {
    const { client, state } = createFakeSupabase([])
    const resolver = createAuthResolver({
      jwtVerifyFn: (async () =>
        createJwtVerifyResult({
          email: "new@example.com",
          sub: "nebula-user-2",
          token_type: "access",
        })) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: mockHs256Header,
      logger: { warn() {} },
      supabase: client,
    })

    const user = await resolver.requireAuth(
      new Request("https://observatory.test/api/auth/session", {
        headers: {
          authorization: "Bearer test-token",
        },
      })
    )

    expect(user).toEqual({
      email: "new@example.com",
      id: state.profiles[0]?.id,
      nebulaUserId: "nebula-user-2",
    })
    expect(state.profiles).toMatchObject([
      {
        display_name: "new",
        email: "new@example.com",
        nebula_user_id: "nebula-user-2",
      },
    ])
  })

  test("fails closed on linked-profile email sync conflicts", async () => {
    const { client } = createFakeSupabase(
      [
        {
          email: "old@example.com",
          id: "profile-1",
          nebula_user_id: "nebula-user-1",
        },
      ],
      {
        onUpdate: (patch) =>
          patch.email === "new@example.com" ? createProfileConflictError() : null,
      }
    )
    const resolver = createAuthResolver({
      logger: { warn() {} },
      supabase: client,
    })

    await expect(
      resolver.resolveProfileByNebulaIdentity({
        email: "new@example.com",
        id: "nebula-user-1",
      })
    ).rejects.toMatchObject(new AuthError("Profile mapping conflict", 409))
  })

  test("rejects bearer tokens without subject/email claims", async () => {
    const { client } = createFakeSupabase([])
    const resolver = createAuthResolver({
      jwtVerifyFn: (async () =>
        createJwtVerifyResult({
          sub: "nebula-user-3",
          token_type: "access",
        })) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: mockHs256Header,
      logger: { warn() {} },
      supabase: client,
    })

    await expect(
      resolver.requireAuth(
        new Request("https://observatory.test/api/auth/session", {
          headers: {
            authorization: "Bearer test-token",
          },
        })
      )
    ).rejects.toMatchObject(new AuthError("Token missing subject or email claim", 401))
  })

  test("verifies RS256 bearer tokens via the JWKS resolver", async () => {
    const { client } = createFakeSupabase([
      {
        email: "rs256@example.com",
        id: "profile-rs",
        nebula_user_id: "nebula-rs-1",
      },
    ])
    let capturedKeyArg: unknown = null
    let capturedAlgs: string[] | undefined
    const resolver = createAuthResolver({
      jwtVerifyFn: (async (
        _token: string,
        key: unknown,
        opts: { algorithms?: string[] }
      ) => {
        capturedKeyArg = key
        capturedAlgs = opts?.algorithms
        return createJwtVerifyResult({
          email: "rs256@example.com",
          sub: "nebula-rs-1",
          token_type: "access",
        })
      }) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: mockRs256Header,
      logger: { warn() {} },
      supabase: client,
    })

    const user = await resolver.requireAuth(
      new Request("https://observatory.test/api/auth/session", {
        headers: { authorization: "Bearer rs256-token" },
      })
    )

    expect(user.email).toBe("rs256@example.com")
    expect(capturedAlgs).toEqual(["RS256"])
    // The RS256 branch must hand jwtVerify the JWKS resolver function (the
    // result of createRemoteJWKSet), NOT the HS256 shared secret bytes.
    // Otherwise an attacker with the public key could forge tokens claiming
    // alg=HS256 and have them verified against the public key.
    expect(typeof capturedKeyArg).toBe("function")
    expect(capturedKeyArg).not.toBeInstanceOf(Uint8Array)
  })

  test("rejects HS256 bearer tokens when no shared secret is configured", async () => {
    const { client } = createFakeSupabase([])
    let jwtVerifyCalled = false
    const resolver = createAuthResolver({
      jwtVerifyFn: (async () => {
        jwtVerifyCalled = true
        return createJwtVerifyResult({})
      }) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: mockHs256Header,
      jwtSecret: null,
      logger: { warn() {} },
      supabase: client,
    })

    await expect(
      resolver.requireAuth(
        new Request("https://observatory.test/api/auth/session", {
          headers: { authorization: "Bearer hs256-token" },
        })
      )
    ).rejects.toMatchObject({ message: "HS256 verification not configured", status: 401 })
    // Don't even invoke jwtVerify when there's no secret to verify against.
    expect(jwtVerifyCalled).toBe(false)
  })

  test("rejects bearer tokens with unsupported alg", async () => {
    const { client } = createFakeSupabase([])
    const resolver = createAuthResolver({
      jwtVerifyFn: (async () => {
        throw new Error("jwtVerify should not be called for unsupported alg")
      }) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: (() => ({ alg: "none", typ: "JWT" })) as unknown as typeof import(
        "jose"
      ).decodeProtectedHeader,
      logger: { warn() {} },
      supabase: client,
    })

    await expect(
      resolver.requireAuth(
        new Request("https://observatory.test/api/auth/session", {
          headers: { authorization: "Bearer none-token" },
        })
      )
    ).rejects.toMatchObject({ message: "Unsupported token algorithm", status: 401 })
  })

  test("rejects malformed bearer tokens before reaching jwtVerify", async () => {
    const { client } = createFakeSupabase([])
    let jwtVerifyCalled = false
    const resolver = createAuthResolver({
      jwtVerifyFn: (async () => {
        jwtVerifyCalled = true
        return createJwtVerifyResult({})
      }) as unknown as typeof import("jose").jwtVerify,
      decodeProtectedHeaderFn: (() => {
        throw new Error("malformed JWT")
      }) as unknown as typeof import("jose").decodeProtectedHeader,
      logger: { warn() {} },
      supabase: client,
    })

    await expect(
      resolver.requireAuth(
        new Request("https://observatory.test/api/auth/session", {
          headers: { authorization: "Bearer not-a-jwt" },
        })
      )
    ).rejects.toMatchObject(new AuthError("Invalid or expired token", 401))
    expect(jwtVerifyCalled).toBe(false)
  })

  test("treats malformed session cookies as anonymous in optionalAuth", async () => {
    const { client } = createFakeSupabase([])
    const resolver = createAuthResolver({
      fetchFn: (async () => {
        throw new Error("Malformed cookies should not reach session validation")
      }) as unknown as typeof fetch,
      logger: { warn() {} },
      supabase: client,
    })

    const user = await resolver.optionalAuth(
      new Request("https://observatory.test/api/runs", {
        headers: {
          cookie: "observatory_session=%zz",
        },
      })
    )

    expect(user).toBeNull()
  })
})
