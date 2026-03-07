import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

export default function AuthCallbackPage() {
  const { loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      navigate("/leaderboard", { replace: true })
    }
  }, [loading, navigate])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-text-secondary animate-pulse">Signing in...</p>
    </div>
  )
}
