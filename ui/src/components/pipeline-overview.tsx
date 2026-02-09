import { useState } from "react"
import { CheckCircle2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip } from "@/components/tooltip"

interface PipelineOverviewProps {
  summary: {
    total: number
    ingested: number
    indexed: number
    searched: number
    evaluated: number
    indexingEpisodes?: {
      total: number
      completed: number
      failed: number
    }
  }
}

const phases = [
  { key: "ingested", label: "Ingest" },
  { key: "indexed", label: "Index" },
  { key: "searched", label: "Search" },
  { key: "evaluated", label: "Evaluate" },
] as const

export function PipelineOverview({ summary }: PipelineOverviewProps) {
  const [showEpisodes, setShowEpisodes] = useState(false)

  return (
    <div className="flex items-stretch gap-0">
      {phases.map((phase, idx) => {
        const count = summary[phase.key]
        const total = summary.total
        const progress = total > 0 ? (count / total) * 100 : 0
        const isComplete = count === total && total > 0
        const isActive = count > 0 && count < total
        const isPending = count === 0

        // Previous phase count for determining if this phase could be active
        const prevCount = idx > 0 ? summary[phases[idx - 1].key] : total
        const couldBeActive = prevCount > 0

        const episodes = summary.indexingEpisodes
        const canToggleEpisodes =
          phase.key === "indexed" && episodes && episodes.total > 0 && !isComplete

        const displayLabel = showEpisodes && canToggleEpisodes ? "Episodes" : phase.label
        const displayCount = showEpisodes && canToggleEpisodes ? episodes!.completed : count
        const displayTotal = showEpisodes && canToggleEpisodes ? episodes!.total : total
        const displayProgress =
          showEpisodes && canToggleEpisodes
            ? (episodes!.completed / episodes!.total) * 100
            : progress

        const card = (
          <div
            key={phase.key}
            className={cn(
              "flex-1 relative bg-bg-surface/80 border border-border rounded-lg p-4 transition-all",
              canToggleEpisodes && "cursor-pointer hover:border-border-hover",
              isActive && "border-accent/30"
            )}
            onClick={canToggleEpisodes ? () => setShowEpisodes(!showEpisodes) : undefined}
          >
            {/* Phase label and count */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-status-success" />
                ) : isActive ? (
                  <div className="w-3 h-3 rounded-full bg-accent phase-dot-active" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-border" />
                )}
                <span className="text-sm text-text-secondary">{displayLabel}</span>
              </div>
              <span className="text-sm tabular-nums text-text-muted">
                {displayCount}/{displayTotal}
                {showEpisodes && canToggleEpisodes && episodes!.failed > 0 && (
                  <span className="text-status-error ml-1">({episodes!.failed} failed)</span>
                )}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isComplete && "bg-status-success",
                  isActive && !showEpisodes && "bg-accent",
                  isActive && showEpisodes && canToggleEpisodes && "shimmer-bar",
                  isPending && "bg-transparent"
                )}
                style={{ width: `${displayProgress}%` }}
              />
            </div>
          </div>
        )

        return (
          <div key={phase.key} className="flex items-center flex-1">
            {canToggleEpisodes ? (
              <Tooltip content="Click to toggle episode view" className="flex-1">
                {card}
              </Tooltip>
            ) : (
              <div className="flex-1">{card}</div>
            )}
            {idx < phases.length - 1 && (
              <ChevronRight className="w-4 h-4 text-text-muted mx-1 flex-shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}
