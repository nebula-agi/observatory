import { useState, useMemo } from "react"
import { Search, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { MultiSelect } from "@/components/multi-select"

export interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  mono?: boolean
}

export function StatCard({ label, value, subtext, mono }: StatCardProps) {
  return (
    <div className="bg-bg-surface/50 p-4 rounded-lg border border-border transition-colors hover:bg-bg-surface-hover">
      <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={cn("text-xl font-semibold text-text-primary truncate tabular-nums", mono && "font-mono text-lg")}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {subtext && <div className="text-xs text-text-secondary mt-1">{subtext}</div>}
    </div>
  )
}

export interface StatsGridProps {
  cards: StatCardProps[]
}

export function StatsGrid({ cards }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {cards.map((card, idx) => (
        <StatCard key={idx} {...card} />
      ))}
    </div>
  )
}

export interface QuestionTypeStats {
  accuracy: number
  correct: number
  total: number
}

export interface AccuracyByTypeProps {
  byQuestionType: Record<string, QuestionTypeStats>
}

export function AccuracyByType({ byQuestionType }: AccuracyByTypeProps) {
  if (!byQuestionType || Object.keys(byQuestionType).length === 0) {
    return null
  }

  return (
    <div className="bg-bg-surface/80 backdrop-blur-sm border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4 font-display">
        Accuracy by Question Type
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byQuestionType).map(([type, stats]) => (
          <div key={type} className="bg-bg-surface/50 p-4 rounded-lg border border-border">
            <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">
              {type.replace(/[-_]/g, " ")}
            </div>
            <div className="text-xl font-semibold text-text-primary tabular-nums">
              {(stats.accuracy * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-text-secondary">
              {stats.correct}/{stats.total}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface LatencyStats {
  min: number
  max: number
  mean: number
  median: number
  p95: number
  p99: number
}

export interface LatencyTableProps {
  latency?: {
    ingest?: LatencyStats
    indexing?: LatencyStats
    search?: LatencyStats
    evaluate?: LatencyStats
    total?: LatencyStats
  } | null
}

export function LatencyTable({ latency }: LatencyTableProps) {
  if (!latency) return null

  return (
    <div className="bg-bg-surface/80 backdrop-blur-sm border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4 font-display">
        Latency Stats (ms)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-surface/30">
              <th className="text-left py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                phase
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                min
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                max
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                mean
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                median
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                p95
              </th>
              <th className="text-right py-2.5 px-3 text-text-muted/70 font-medium uppercase text-xs tracking-wider">
                p99
              </th>
            </tr>
          </thead>
          <tbody>
            {(["ingest", "indexing", "search", "evaluate", "total"] as const).map(
              (phase) => {
                const stats = latency[phase]
                if (!stats) return null
                return (
                  <tr key={phase} className="border-b border-border last:border-0 transition-colors hover:bg-accent/[0.03]">
                    <td className="py-2.5 px-3 text-text-primary capitalize">{phase}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-secondary tabular-nums">
                      {stats.min}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-secondary tabular-nums">
                      {stats.max}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-secondary tabular-nums">
                      {stats.mean}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-primary tabular-nums">
                      {stats.median}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-secondary tabular-nums">
                      {stats.p95}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text-secondary tabular-nums">
                      {stats.p99}
                    </td>
                  </tr>
                )
              }
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export interface EvaluationResult {
  questionId: string
  questionType: string
  question?: string
  groundTruth: string
  score?: number
  label?: string
  explanation?: string
}

export interface EvaluationListProps {
  evaluations: EvaluationResult[]
  onViewDetails?: (questionId: string) => void
}

export function EvaluationList({ evaluations, onViewDetails }: EvaluationListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [showFailuresOnly, setShowFailuresOnly] = useState(false)

  const questionTypes = useMemo(() => {
    const counts: Record<string, number> = {}
    evaluations.forEach((e) => {
      const type = e.questionType || "unknown"
      counts[type] = (counts[type] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value.replace(/[-_]/g, " "),
      count,
    }))
  }, [evaluations])

  const failureCount = useMemo(() => {
    return evaluations.filter((e) => e.label === "incorrect" || e.score === 0).length
  }, [evaluations])

  const filtered = useMemo(() => {
    return evaluations.filter((e) => {
      if (showFailuresOnly && e.label !== "incorrect" && e.score !== 0) {
        return false
      }

      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          e.questionId.toLowerCase().includes(searchLower) ||
          (e.question?.toLowerCase().includes(searchLower) ?? false) ||
          e.groundTruth.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      const type = e.questionType || "unknown"
      if (selectedTypes.length > 0 && !selectedTypes.includes(type)) {
        return false
      }

      return true
    })
  }, [evaluations, search, selectedTypes, showFailuresOnly])

  const hasActiveFilters = search || selectedTypes.length > 0 || showFailuresOnly

  if (evaluations.length === 0) {
    return <div className="text-center py-8 text-text-secondary">No results available</div>
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm px-1 mb-2">
          <span className="text-text-secondary">
            Showing {filtered.length} of {evaluations.length}{" "}
            {evaluations.length === 1 ? "result" : "results"}
          </span>
          <button
            type="button"
            className={cn(
              "text-text-muted hover:text-text-primary transition-colors cursor-pointer",
              !hasActiveFilters && "opacity-50"
            )}
            onClick={() => {
              setSearch("")
              setSelectedTypes([])
              setShowFailuresOnly(false)
            }}
          >
            Clear filters
          </button>
        </div>

        <div className="inline-flex border border-border rounded-lg">
          <div className="w-[200px] border-r border-border">
            <div className="relative h-[40px] flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search results..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-full pl-9 pr-3 text-sm bg-transparent text-text-primary placeholder-text-muted focus:outline-none cursor-text"
              />
            </div>
          </div>

          <div className="w-[180px] border-r border-border">
            <MultiSelect
              label="Select question types"
              options={questionTypes}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              placeholder="All types"
            />
          </div>

          <button
            type="button"
            className={cn(
              "w-[120px] h-[40px] flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer rounded-r-lg",
              showFailuresOnly
                ? "bg-status-error/10 text-status-error"
                : "text-text-muted hover:text-text-primary"
            )}
            onClick={() => setShowFailuresOnly(!showFailuresOnly)}
          >
            <span>Failures</span>
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded-lg",
                showFailuresOnly ? "bg-status-error/20" : "bg-bg-elevated"
              )}
            >
              {failureCount}
            </span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">
          {showFailuresOnly ? "No failures found" : "No results match your filters"}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {filtered.map((evaluation, idx) => {
            const isExpanded = expandedId === evaluation.questionId
            const isCorrect = evaluation.score === 1 || evaluation.label === "correct"
            const isLast = idx === filtered.length - 1

            return (
              <div
                key={evaluation.questionId}
                className={cn(
                  "group cursor-pointer transition-colors hover:bg-bg-surface-hover",
                  !isLast && !isExpanded && "border-b border-border"
                )}
              >
                <div
                  className="px-4 py-3 flex items-center gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : evaluation.questionId)}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      isCorrect ? "bg-status-success" : "bg-status-error"
                    )}
                  />

                  <span className="text-sm text-text-secondary w-[140px] flex-shrink-0">
                    {evaluation.questionId}
                  </span>

                  <span className="text-xs px-2 py-0.5 rounded-lg bg-bg-elevated text-text-muted flex-shrink-0">
                    {evaluation.questionType?.replace(/[-_]/g, " ")}
                  </span>

                  <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                    {evaluation.question || evaluation.groundTruth}
                  </span>

                  <span
                    className={cn(
                      "text-sm font-medium flex-shrink-0",
                      isCorrect ? "text-status-success" : "text-status-error"
                    )}
                  >
                    {evaluation.label}
                  </span>

                  {onViewDetails && (
                    <button
                      className="text-xs text-text-muted hover:text-accent transition-colors cursor-pointer flex-shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewDetails(evaluation.questionId)
                      }}
                    >
                      View details
                    </button>
                  )}

                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-text-muted transition-transform flex-shrink-0",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>

                {isExpanded && (
                  <div
                    className={cn(
                      "px-4 py-4 space-y-4 bg-bg-primary/60 border-t border-border overflow-hidden",
                      !isLast && "border-b border-border"
                    )}
                  >
                    {evaluation.question && (
                      <div className="min-w-0">
                        <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">
                          Question
                        </div>
                        <div className="text-sm text-text-primary break-words">
                          {evaluation.question}
                        </div>
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">
                        Expected Answer
                      </div>
                      <div className="text-sm text-text-primary bg-bg-elevated p-3 rounded-lg break-words">
                        {evaluation.groundTruth}
                      </div>
                    </div>

                    {evaluation.explanation && (
                      <div className="min-w-0">
                        <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">
                          Explanation
                        </div>
                        <div className="text-sm text-text-secondary break-words">
                          {evaluation.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
