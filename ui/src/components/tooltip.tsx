import { useState, ReactNode } from "react"

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-50 left-0 bottom-full mb-1.5 px-2.5 py-1.5 text-xs text-text-secondary bg-bg-surface/95 backdrop-blur-xl border border-border rounded-md whitespace-nowrap shadow-glass-sm animate-fade-in">
          {content}
        </div>
      )}
    </div>
  )
}
