import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from "react"

const API_BASE = import.meta.env.VITE_API_URL || ""
const NEBULA_API = import.meta.env.VITE_NEBULA_API_URL || "https://api.trynebula.ai"
const ACCESS_TOKEN_KEY = "observatory_access_token"
const REFRESH_TOKEN_KEY = "observatory_refresh_token"

/** Try to refresh the access token using the stored refresh token. */
async function tryRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return null
  try {
    const resp = await fetch(`${NEBULA_API}/v1/users/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const newAccess = data.results?.access_token?.token
    const newRefresh = data.results?.refresh_token?.token
    if (!newAccess) return null
    localStorage.setItem(ACCESS_TOKEN_KEY, newAccess)
    if (newRefresh) localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh)
    return newAccess
  } catch {
    return null
  }
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export interface AuthContextType {
  user: AuthUser | null
  session: { access_token: string } | null
  loading: boolean
  authEnabled: boolean
  signIn: (email: string, password: string) => Promise<unknown>
  signUp: (email: string, password: string, displayName?: string) => Promise<unknown>
  signInWithOAuth: (provider: "github" | "google") => Promise<void>
  signOut: () => Promise<void>
  getToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Hydrate from stored token on mount
  useEffect(() => {
    const hydrate = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const resp = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (resp.ok) {
          const data = await resp.json()
          setUser({ id: data.id, email: data.email, displayName: data.displayName })
        } else if (resp.status === 401) {
          const newToken = await tryRefresh()
          if (newToken) {
            const retryResp = await fetch(`${API_BASE}/api/auth/me`, {
              headers: { Authorization: `Bearer ${newToken}` },
            })
            if (retryResp.ok) {
              const data = await retryResp.json()
              setUser({ id: data.id, email: data.email, displayName: data.displayName })
              setLoading(false)
              return
            }
          }
          localStorage.removeItem(ACCESS_TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
        } else {
          localStorage.removeItem(ACCESS_TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    hydrate()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || "Login failed")
    if (!data.access_token) throw new Error("Login succeeded but no token was returned")

    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
    if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)

    const meResp = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    if (!meResp.ok) throw new Error("Failed to fetch user profile")
    const me = await meResp.json()
    setUser({ id: me.id, email: me.email, displayName: me.displayName })
    return data
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const resp = await fetch(`${API_BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || "Signup failed")
    return data
  }, [])

  const signInWithOAuth = useCallback(async (provider: "github" | "google") => {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `${NEBULA_API}/v1/users/oauth/${provider}/authorize?returnUrl=${returnUrl}`
  }, [])

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
      } catch { /* best effort */ }
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setUser(null)
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  }, [])

  const value: AuthContextType = {
    user,
    session: user ? { access_token: localStorage.getItem(ACCESS_TOKEN_KEY) || "" } : null,
    loading,
    authEnabled: true,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    getToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
