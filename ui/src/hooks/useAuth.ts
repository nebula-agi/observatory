import { useState, useEffect, useCallback } from "react"
import { supabase, isAuthEnabled } from "../lib/supabase"
import type { User, Session } from "@supabase/supabase-js"

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  authEnabled: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    authEnabled: isAuthEnabled(),
  })

  useEffect(() => {
    if (!supabase) {
      setState((prev) => ({ ...prev, loading: false }))
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        authEnabled: true,
      })
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        authEnabled: true,
      })

      // Auto-create profile for OAuth users who don't have one yet
      if (event === "SIGNED_IN" && session?.user) {
        const user = session.user
        const displayName =
          user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "User"
        const avatarUrl = user.user_metadata?.avatar_url || null

        supabase!
          .from("profiles")
          .upsert(
            { id: user.id, display_name: displayName, avatar_url: avatarUrl },
            { onConflict: "id" }
          )
          .then(({ error }) => {
            if (error) console.warn("Failed to upsert profile:", error.message)
          })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Auth not enabled")
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!supabase) throw new Error("Auth not enabled")
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
      },
    })
    if (error) throw error
    return data
  }, [])

  const signInWithOAuth = useCallback(async (provider: "github" | "google") => {
    if (!supabase) throw new Error("Auth not enabled")
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  return {
    ...state,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    getToken,
  }
}
