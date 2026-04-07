import { useState, useEffect, useCallback } from "react"

const API_BASE = import.meta.env.VITE_API_URL || ""
const ACCESS_TOKEN_KEY = "observatory_access_token"
const REFRESH_TOKEN_KEY = "observatory_refresh_token"

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  authEnabled: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    authEnabled: true,
  })

  // Hydrate from stored token on mount
  useEffect(() => {
    const hydrate = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      if (!token) {
        setState({ user: null, loading: false, authEnabled: true })
        return
      }

      try {
        const resp = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (resp.ok) {
          const data = await resp.json()
          setState({
            user: { id: data.id, email: data.email, displayName: data.displayName },
            loading: false,
            authEnabled: true,
          })
        } else {
          // Token invalid -- clear
          localStorage.removeItem(ACCESS_TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
          setState({ user: null, loading: false, authEnabled: true })
        }
      } catch {
        setState({ user: null, loading: false, authEnabled: true })
      }
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

    // Fetch user profile
    const meResp = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    if (!meResp.ok) throw new Error("Failed to fetch user profile")
    const me = await meResp.json()
    setState({
      user: { id: me.id, email: me.email, displayName: me.displayName },
      loading: false,
      authEnabled: true,
    })
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
    // Redirect to Nebula's OAuth authorize endpoint
    const nebulaBase = import.meta.env.VITE_NEBULA_API_URL || "https://api.trynebula.ai"
    const returnUrl = encodeURIComponent(window.location.href)
    window.location.href = `${nebulaBase}/v1/users/oauth/${provider}/authorize?returnUrl=${returnUrl}`
  }, [])

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch { /* best effort */ }
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setState({ user: null, loading: false, authEnabled: true })
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  }, [])

  return {
    ...state,
    session: state.user ? { access_token: localStorage.getItem(ACCESS_TOKEN_KEY) || "" } : null,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    getToken,
  }
}
