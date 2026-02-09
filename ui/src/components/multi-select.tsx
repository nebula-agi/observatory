import { useState, useRef, useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Search, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
  count?: number
}

interface MultiSelectProps {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  searchable?: boolean
  placeholder?: string
  renderTrigger?: (props: { selected: string[]; open: boolean }) => ReactNode
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = true,
  placeholder,
  renderTrigger,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Calculate dropdown position
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
      })
    }
  }, [open])

  // Focus search input when opened
  useEffect(() => {
    if (open && searchable && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, searchable])

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
        setSearch("")
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  // Filter options based on search
  const filteredOptions = search
    ? options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayText =
    selected.length === 0
      ? placeholder || label
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || selected[0]
        : selected.length <= 2
          ? selected.map((v) => options.find((o) => o.value === v)?.label || v).join(", ")
          : `${selected.length} selected`

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        className={
          renderTrigger
            ? "cursor-pointer w-full"
            : cn(
                "flex items-center justify-between gap-2 px-3 py-2.5 text-sm w-full cursor-pointer",
                "bg-transparent text-text-secondary hover:text-text-primary transition-colors",
                selected.length > 0 && "text-text-primary"
              )
        }
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        {renderTrigger ? (
          renderTrigger({ selected, open })
        ) : (
          <>
            <span className="truncate">{displayText}</span>
            <ChevronDown
              className={cn("w-4 h-4 flex-shrink-0 transition-transform", open && "rotate-180")}
            />
          </>
        )}
      </button>

      {/* Dropdown - rendered via portal */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-glass animate-slide-down"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            {/* Search input */}
            {searchable && (
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search values..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-bg-primary/60 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}

            {/* Options list */}
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-text-muted">No options found</div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = selected.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer",
                        "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary",
                        isSelected && "text-text-primary"
                      )}
                      onClick={() => toggleOption(option.value)}
                    >
                      {/* Checkbox */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0",
                          isSelected ? "bg-accent border-accent" : "border-border-hover bg-transparent"
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>

                      {/* Label */}
                      <span className="flex-1 truncate">{option.label}</span>

                      {/* Count */}
                      {option.count !== undefined && (
                        <span className="text-text-muted text-xs">{option.count}</span>
                      )}
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
