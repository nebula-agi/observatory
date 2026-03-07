import { useState, useRef, useEffect } from "react"
import { LogOut, Settings } from "lucide-react"
import { NavLink } from "react-router-dom"

interface UserMenuProps {
  email: string
  displayName?: string
  avatarUrl?: string
  onSignOut: () => void
}

export function UserMenu({ email, displayName, avatarUrl, onSignOut }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("")

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-bg-surface transition-colors cursor-pointer"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName || email}
            className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-bg-elevated text-text-secondary flex items-center justify-center text-xs font-bold flex-shrink-0 border border-border">
            {initials}
          </div>
        )}
        <span className="text-text-secondary text-xs">
          {displayName || email}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-52 bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-glass py-1 z-50 animate-slide-up">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-sm font-medium text-text-primary truncate">
              {displayName || email}
            </p>
            {displayName && (
              <p className="text-xs text-text-muted truncate mt-0.5">{email}</p>
            )}
          </div>

          <NavLink
            to="/settings"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </NavLink>

          <button
            onClick={() => {
              setIsOpen(false)
              onSignOut()
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
