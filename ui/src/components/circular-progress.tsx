interface CircularProgressProps {
  progress: number // 0 to 1
  size?: number
  strokeWidth?: number
  showPercentage?: boolean
}

import { useId } from "react"

export function CircularProgress({
  progress,
  size = 20,
  strokeWidth = 2.5,
  showPercentage = false,
}: CircularProgressProps) {
  const gradientId = useId()
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - progress * circumference

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="transform -rotate-90"
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-bg-elevated"
      />

      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />

      {/* Gradient definition */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5040ff" />
          <stop offset="100%" stopColor="#7366ff" />
        </linearGradient>
      </defs>

      {/* Optional percentage text */}
      {showPercentage && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-text-primary text-[8px] transform rotate-90"
          style={{ transformOrigin: "center" }}
        >
          {Math.round(progress * 100)}
        </text>
      )}
    </svg>
  )
}
