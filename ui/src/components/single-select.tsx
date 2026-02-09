import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SingleSelectProps {
  label: string
  options: Option[]
  selected: string
  onChange: (selected: string) => void
  placeholder?: string
  wide?: boolean
  dropUp?: boolean
}

export function SingleSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  wide,
  dropUp,
}: SingleSelectProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, bottom: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const minWidth = wide ? 400 : 200
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, minWidth),
        bottom: window.innerHeight - rect.top + 4,
      })
    }
  }, [open, wide])

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

  const selectOption = (value: string) => {
    onChange(value)
    setOpen(false)
  }

  const displayText = selected
    ? options.find((o) => o.value === selected)?.label || selected
    : placeholder || label

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2.5 text-sm w-full cursor-pointer rounded-lg",
          "bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors",
          selected && "text-text-primary"
        )}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown
          className={cn("w-4 h-4 flex-shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown - rendered via portal */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg overflow-hidden shadow-glass animate-slide-down"
            style={{
              ...(dropUp ? { bottom: position.bottom } : { top: position.top }),
              left: position.left,
              width: position.width,
            }}
          >
            {/* Options list */}
            <div className="max-h-64 overflow-y-auto">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-text-muted">No options</div>
              ) : (
                options.map((option) => {
                  const isSelected = selected === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-2 px-3 text-sm text-left transition-colors cursor-pointer",
                        "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary",
                        isSelected && "text-text-primary bg-bg-surface",
                        "py-2"
                      )}
                      onClick={() => selectOption(option.value)}
                    >
                      {/* Radio indicator */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0",
                          isSelected ? "border-accent" : "border-border-hover"
                        )}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>

                      {/* Label and sublabel */}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.sublabel && (
                          <span className="block text-xs text-text-muted truncate">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
