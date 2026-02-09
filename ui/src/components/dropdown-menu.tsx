import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { MoreVertical } from "lucide-react"
import { cn } from "@/lib/utils"

interface MenuItem {
  label?: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface DropdownMenuProps {
  items: MenuItem[]
  align?: "left" | "right"
}

export function DropdownMenu({ items, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Calculate dropdown position
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const dropdownWidth = 192 // w-48 = 12rem = 192px

      setPosition({
        top: rect.bottom + 4,
        left: align === "right" ? rect.right - dropdownWidth : rect.left,
      })
    }
  }, [open, align])

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-surface-hover transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {/* Dropdown - rendered via portal */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-48 bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-glass animate-slide-down"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            <div className="py-1">
              {items.map((item, idx) => {
                if (item.divider) {
                  return <div key={idx} className="border-t border-border my-1" />
                }

                const className = cn(
                  "w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer",
                  item.disabled
                    ? "text-text-muted cursor-not-allowed"
                    : item.danger
                      ? "text-status-error hover:bg-bg-surface-hover"
                      : "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                )

                if (item.href && !item.disabled) {
                  return (
                    <Link
                      key={idx}
                      to={item.href}
                      className={className}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                  )
                }

                return (
                  <button
                    key={idx}
                    className={className}
                    disabled={item.disabled}
                    onClick={() => {
                      if (!item.disabled && item.onClick) {
                        item.onClick()
                        setOpen(false)
                      }
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
