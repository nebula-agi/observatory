import { NavLink, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { LogIn } from "lucide-react"
import { UserMenu } from "./user-menu"

const navigation = [
  { name: "Leaderboard", href: "/leaderboard" },
  { name: "Runs", href: "/runs" },
  { name: "Methodology", href: "/methodology" },
]

interface TopNavProps {
  user?: { email: string; displayName?: string } | null
  authEnabled?: boolean
  onSignIn?: () => void
  onSignOut?: () => void
}

export function TopNav({ user, authEnabled, onSignIn, onSignOut }: TopNavProps) {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-40 h-14 bg-bg-primary/80 backdrop-blur-xl border-b border-border flex items-center px-6">
      {/* Logo */}
      <NavLink to="/" className="flex items-center mr-8">
        <span className="font-display text-lg text-text-primary font-medium tracking-tight">
          Observatory
        </span>
      </NavLink>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === "/runs"}
            className="relative"
          >
            {({ isActive }) => {
              const isNavActive = isActive || location.pathname.startsWith(item.href)

              return (
                <div
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isNavActive
                      ? "text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span>{item.name}</span>

                  {/* Active underline indicator */}
                  {isNavActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                </div>
              )
            }}
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Auth */}
      {authEnabled && user && onSignOut ? (
        <UserMenu email={user.email} displayName={user.displayName} onSignOut={onSignOut} />
      ) : onSignIn ? (
        <button
          onClick={onSignIn}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In</span>
        </button>
      ) : null}
    </header>
  )
}
