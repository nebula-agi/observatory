import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

const API_BASE = import.meta.env.VITE_API_URL || ""

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const exchange = async () => {
      const code = searchParams.get("code")
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
        const returnUrl = data.results?.return_url ?? data.return_url
        window.location.href = returnUrl || "/leaderboard"
      } catch (e) {
        setError(e instanceof Error ? e.message : "OAuth sign-in failed")
      }
    }
    exchange()
  }, [searchParams])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-sm text-red-400">{error}</p>
        <a href="/" className="text-sm text-accent hover:underline">Return home</a>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-text-secondary animate-pulse">Completing sign-in...</p>
    </div>
  )
}
