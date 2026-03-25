import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { MoreVertical } from "lucide-react"
import { cn } from "@/lib/utils"

interface RunActionsMenuProps {
  runId: string
  status: string
  onDelete: () => void
  onTerminate?: () => void
  onContinue?: () => void
  onFork?: () => void
}

export function RunActionsMenu({
  runId,
  status,
  onDelete,
  onTerminate,
  onContinue,
  onFork,
}: RunActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isRunning = status === "running"
  const isStopping = status === "stopping"
  const isFailed = status === "failed"
  const isPartial = status === "partial"
  const isCompleted = status === "completed"
  const canContinue = isFailed || isPartial
  const canFork = isCompleted || isPartial || isFailed

  // Calculate dropdown position
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const dropdownWidth = 192

      setPosition({
        top: rect.bottom + 4,
        left: rect.right - dropdownWidth,
      })
    }
  }, [open])

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node

      if (open && triggerRef.current && dropdownRef.current) {
        if (!triggerRef.current.contains(target) && !dropdownRef.current.contains(target)) {
          setOpen(false)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        data-no-row-click
        className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-surface-hover transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {/* Dropdown menu */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            data-no-row-click
            className="fixed z-[9999] w-48 bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-glass animate-slide-down"
            style={{
              top: position.top,
              left: position.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              <Link
                to={`/runs/${encodeURIComponent(runId)}`}
                className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                onClick={() => setOpen(false)}
              >
                view details
              </Link>

              {canContinue && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer text-accent hover:bg-bg-surface-hover"
                    onClick={() => {
                      onContinue?.()
                      setOpen(false)
                    }}
                  >
                    continue
                  </button>
                </>
              )}

              {canFork && onFork && (
                <>
                  {!canContinue && <div className="border-t border-border my-1" />}
                  <button
                    className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                    onClick={() => {
                      onFork()
                      setOpen(false)
                    }}
                  >
                    fork from checkpoint
                  </button>
                </>
              )}

              <div className="border-t border-border my-1" />

              {(isRunning || isStopping) && (
                <button
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer",
                    isStopping
                      ? "text-text-muted cursor-not-allowed"
                      : "text-status-error hover:bg-bg-surface-hover"
                  )}
                  disabled={isStopping}
                  onClick={() => {
                    onTerminate?.()
                    setOpen(false)
                  }}
                >
                  {isStopping ? "stopping..." : "terminate"}
                </button>
              )}
              <button
                className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2 cursor-pointer text-status-error hover:bg-bg-surface-hover"
                onClick={() => {
                  onDelete()
                  setOpen(false)
                }}
              >
                delete
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
