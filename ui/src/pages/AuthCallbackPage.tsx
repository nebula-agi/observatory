import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

const API_BASE = import.meta.env.VITE_API_URL || ""
const NEBULA_API = import.meta.env.VITE_NEBULA_API_URL || "https://api.trynebula.ai"

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const exchange = async () => {
      const code = searchParams.get("code")
      if (!code) {
        setError("Missing OAuth code")
        return
      }

      try {
        // Exchange the one-time code for Nebula tokens
        const resp = await fetch(`${NEBULA_API}/v1/users/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.detail || err.message || "OAuth exchange failed")
        }

        const data = await resp.json()
        const accessToken = data.results?.access_token ?? data.access_token
        const refreshToken = data.results?.refresh_token ?? data.refresh_token

        if (!accessToken) throw new Error("No access token in exchange response")

        localStorage.setItem("observatory_access_token", accessToken)
        if (refreshToken) localStorage.setItem("observatory_refresh_token", refreshToken)

        // Navigate to the return URL or default page
        const returnUrl = data.results?.return_url ?? data.return_url
        navigate(returnUrl || "/leaderboard", { replace: true })
      } catch (e) {
        setError(e instanceof Error ? e.message : "OAuth sign-in failed")
      }
    }
    exchange()
  }, [searchParams, navigate])

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
