import { useState } from "react"
import { useMountEffect } from "../hooks/useMountEffect"

const API_BASE = import.meta.env.VITE_API_URL || ""

function normalizeReturnUrl(returnUrl: unknown): string {
  if (typeof returnUrl !== "string" || !returnUrl) {
    return "/leaderboard"
  }

  if (returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    return returnUrl
  }

  try {
    const parsed = new URL(returnUrl, window.location.origin)
    if (parsed.origin !== window.location.origin) {
      return "/leaderboard"
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/leaderboard"
  } catch {
    return "/leaderboard"
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useMountEffect(() => {
    const exchange = async () => {
      const code = new URLSearchParams(window.location.search).get("code")
      if (!code) {
        setError("Missing OAuth code")
        return
      }

      try {
        // Exchange the one-time code into an Observatory cookie session.
        const resp = await fetch(`${API_BASE}/api/auth/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          credentials: "include",
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.error || err.detail || err.message || "OAuth exchange failed")
        }

        const data = await resp.json()
        const returnUrl = normalizeReturnUrl(data.results?.return_url ?? data.return_url)
        window.location.replace(returnUrl)
      } catch (e) {
        setError(e instanceof Error ? e.message : "OAuth sign-in failed")
      }
    }
    void exchange()
  })

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-sm text-red-400">{error}</p>
        <a href="/" className="text-sm text-accent hover:underline">
          Return home
        </a>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-text-secondary animate-pulse">Completing sign-in...</p>
    </div>
  )
}
