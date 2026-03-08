import { useState, useMemo } from "react"
import { Highlight, themes } from "prism-react-renderer"
import { Search, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, Copy, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { MultiSelect } from "./multi-select"
import type { QuestionCheckpoint, QuestionTypeRegistry } from "@/lib/api"

type SortColumn = "pipeline" | "question" | "type" | "ingest" | "indexing" | "search" | "evaluate"
type SortDirection = "asc" | "desc"

const columnLabels: Record<SortColumn, string> = {
  pipeline: "Pipeline",
  question: "Question",
  type: "Type",
  ingest: "Ingest",
  indexing: "Index",
  search: "Search",
  evaluate: "Evaluate",
}

interface QuestionPipelineTableProps {
  questions: QuestionCheckpoint[]
  questionTypeRegistry?: QuestionTypeRegistry | null
  stickyFilter?: boolean
  autoExpandFailures?: boolean
  showCopyResults?: boolean
  onCopyResults?: () => void
  copied?: boolean
}

const PHASE_KEYS = ["ingest", "indexing", "search", "evaluate"] as const
const PHASE_LABELS: Record<string, string> = {
  ingest: "Ingest",
  indexing: "Index",
  search: "Search",
  evaluate: "Evaluate",
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/** Compute a pipeline stage score: questions being processed come first */
function getPipelineScore(q: QuestionCheckpoint): number {
  const phases = q.phases
  // In-progress questions get highest priority (lowest score)
  for (const key of PHASE_KEYS) {
    if (phases[key].status === "in_progress") return 0
  }
  // Failed questions next
  for (const key of PHASE_KEYS) {
    if (phases[key].status === "failed") return 1
  }
  // Partially completed (not all phases done)
  const completedCount = PHASE_KEYS.filter((k) => phases[k].status === "completed").length
  if (completedCount > 0 && completedCount < 4) return 2
  // Pending (nothing started)
  if (completedCount === 0) return 3
  // Fully completed
  return 4
}

function PhaseDot({ status, phase, question }: { status: string; phase: string; question: QuestionCheckpoint }) {
  if (status === "completed") {
    if (phase === "evaluate") {
      const score = question.phases.evaluate.score
      const isCorrect = score === 1
      return (
        <div className="flex items-center justify-center">
          <div
            className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center",
              isCorrect ? "bg-status-success/15 text-status-success" : "bg-status-error/15 text-status-error"
            )}
          >
            {isCorrect ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-status-success/15 text-status-success flex items-center justify-center">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
      </div>
    )
  }

  if (status === "in_progress") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-2.5 h-2.5 rounded-full bg-accent phase-dot-active" />
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-status-error/15 text-status-error flex items-center justify-center">
          <AlertCircle className="w-3.5 h-3.5" />
        </div>
      </div>
    )
  }

  // pending
  return (
    <div className="flex items-center justify-center">
      <div className="w-2.5 h-2.5 rounded-full bg-bg-elevated" />
    </div>
  )
}

export function QuestionPipelineTable({
  questions,
  questionTypeRegistry,
  stickyFilter,
  autoExpandFailures,
  showCopyResults,
  onCopyResults,
  copied,
}: QuestionPipelineTableProps) {
  const [search, setSearch] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showFailuresOnly, setShowFailuresOnly] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>("pipeline")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [contextExpanded, setContextExpanded] = useState<Set<string>>(new Set())
  const [copiedTag, setCopiedTag] = useState<string | null>(null)

  const questionTypes = useMemo(() => {
    const counts: Record<string, number> = {}
    questions.forEach((q) => {
      counts[q.questionType] = (counts[q.questionType] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: questionTypeRegistry?.[value]?.alias || value.replace(/[-_]/g, " "),
      count,
    }))
  }, [questions, questionTypeRegistry])

  // Count evaluation failures (incorrect answers)
  const failureCount = useMemo(() => {
    return questions.filter((q) => q.phases.evaluate.label === "incorrect").length
  }, [questions])

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      // Failures filter (evaluation-level: incorrect answers)
      if (showFailuresOnly && q.phases.evaluate.label !== "incorrect") return false

      // Search filter — matches questionId, question text, and ground truth
      if (search) {
        const s = search.toLowerCase()
        if (
          !q.questionId.toLowerCase().includes(s) &&
          !q.question.toLowerCase().includes(s) &&
          !q.groundTruth.toLowerCase().includes(s)
        )
          return false
      }
      if (selectedTypes.length > 0 && !selectedTypes.includes(q.questionType)) return false

      // Status filter (phase-level)
      if (statusFilter === "in_progress") {
        const hasActive = PHASE_KEYS.some((k) => q.phases[k].status === "in_progress")
        if (!hasActive) return false
      } else if (statusFilter === "completed") {
        if (q.phases.evaluate.status !== "completed") return false
      } else if (statusFilter === "failed") {
        const hasFailed = PHASE_KEYS.some((k) => q.phases[k].status === "failed")
        if (!hasFailed) return false
      } else if (statusFilter === "pending") {
        const allPending = PHASE_KEYS.every((k) => q.phases[k].status === "pending")
        if (!allPending) return false
      }
      return true
    })
  }, [questions, search, selectedTypes, statusFilter, showFailuresOnly])

  const handleColumnSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d: SortDirection) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortColumn) {
        case "pipeline": {
          const scoreA = getPipelineScore(a)
          const scoreB = getPipelineScore(b)
          if (scoreA !== scoreB) return (scoreA - scoreB) * dir
          return a.questionId.localeCompare(b.questionId) * dir
        }
        case "question":
          return a.questionId.localeCompare(b.questionId) * dir
        case "type":
          return a.questionType.localeCompare(b.questionType) * dir
        case "ingest":
        case "indexing":
        case "search":
        case "evaluate": {
          const statusOrder: Record<string, number> = {
            in_progress: 0,
            completed: 1,
            failed: 2,
            pending: 3,
          }
          const statusA = statusOrder[a.phases[sortColumn].status] ?? 4
          const statusB = statusOrder[b.phases[sortColumn].status] ?? 4
          if (statusA !== statusB) return (statusA - statusB) * dir
          // Secondary sort by duration within same status
          const durA = a.phases[sortColumn].durationMs ?? 0
          const durB = b.phases[sortColumn].durationMs ?? 0
          if (durA !== durB) return (durA - durB) * dir
          return a.questionId.localeCompare(b.questionId)
        }
        default:
          return 0
      }
    })
  }, [filtered, sortColumn, sortDirection])

  // Counts for status filter
  const statusCounts = useMemo(() => {
    let inProgress = 0
    let completed = 0
    let failed = 0
    let pending = 0
    for (const q of questions) {
      const hasActive = PHASE_KEYS.some((k) => q.phases[k].status === "in_progress")
      const hasFailed = PHASE_KEYS.some((k) => q.phases[k].status === "failed")
      const isComplete = q.phases.evaluate.status === "completed"
      const allPending = PHASE_KEYS.every((k) => q.phases[k].status === "pending")
      if (hasActive) inProgress++
      else if (hasFailed) failed++
      else if (isComplete) completed++
      else if (allPending) pending++
      else inProgress++ // partially done counts as in progress
    }
    return { inProgress, completed, failed, pending }
  }, [questions])

  const hasActiveFilters = search || selectedTypes.length > 0 || showFailuresOnly || statusFilter !== "all" || sortColumn !== "pipeline"

  return (
    <div>
      {/* Filter Bar */}
      <div className={cn("mb-4", stickyFilter && "sticky top-0 z-10 bg-bg-primary pt-2 pb-2")}>
        <div className="flex items-center justify-between text-sm px-1 mb-2">
          <span className="text-text-secondary">
            {filtered.length} of {questions.length} questions
          </span>
          <div className="flex items-center gap-3">
            {showCopyResults && onCopyResults && (
              <button
                onClick={onCopyResults}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer flex items-center gap-1.5",
                  copied
                    ? "text-status-success"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy Results
                  </>
                )}
              </button>
            )}
            <div className="flex items-center gap-1">
              {(["all", "in_progress", "completed", "failed"] as const).map((key) => {
                const labels: Record<string, string> = {
                  all: `All (${questions.length})`,
                  in_progress: `Active (${statusCounts.inProgress})`,
                  completed: `Done (${statusCounts.completed})`,
                  failed: `Failed (${statusCounts.failed})`,
                }
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer",
                      statusFilter === key
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:text-text-primary"
                    )}
                  >
                    {labels[key]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="inline-flex border border-border rounded-lg">
          <div className="w-[220px] border-r border-border">
            <div className="relative h-[40px] flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-full pl-9 pr-3 text-sm bg-transparent text-text-primary placeholder-text-muted focus:outline-none cursor-text"
              />
            </div>
          </div>
          <div className="w-[180px] border-r border-border">
            <MultiSelect
              label="Filter by type"
              options={questionTypes}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              placeholder="All types"
            />
          </div>

          {/* Failures toggle */}
          <button
            type="button"
            className={cn(
              "w-[120px] h-[40px] flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer border-r border-border",
              showFailuresOnly
                ? "bg-status-error/10 text-status-error"
                : "text-text-muted hover:text-text-primary"
            )}
            onClick={() => {
              const newValue = !showFailuresOnly
              setShowFailuresOnly(newValue)
              if (newValue && autoExpandFailures) {
                const failures = questions
                  .filter((q) => q.phases.evaluate.label === "incorrect")
                  .slice(0, 3)
                  .map((q) => q.questionId)
                setExpanded(new Set(failures))
              }
            }}
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

          {/* Sort indicator */}
          <button
            type="button"
            className="h-[40px] px-3 flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer rounded-r-lg"
            onClick={() => {
              setSortColumn("pipeline")
              setSortDirection("asc")
            }}
            title="Reset sort to pipeline order"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{columnLabels[sortColumn]}{sortColumn !== "pipeline" ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-text-secondary border border-border rounded-lg">
          {showFailuresOnly ? "No failures found" : "No questions match your filters"}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_60px_60px_60px_60px] gap-0 px-4 h-10 items-center bg-bg-surface/50 border-b border-border">
            <button
              className="text-[11px] text-text-muted uppercase tracking-widest text-left flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
              onClick={() => handleColumnSort("question")}
            >
              Question
              {sortColumn === "question" && (
                sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <button
              className="text-[11px] text-text-muted uppercase tracking-widest text-left flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
              onClick={() => handleColumnSort("type")}
            >
              Type
              {sortColumn === "type" && (
                sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
              )}
            </button>
            {PHASE_KEYS.map((key) => (
              <button
                key={key}
                className="text-[11px] text-text-muted uppercase tracking-widest text-center flex items-center justify-center gap-0.5 hover:text-text-primary transition-colors cursor-pointer"
                onClick={() => handleColumnSort(key)}
              >
                {PHASE_LABELS[key].slice(0, 3)}
                {sortColumn === key && (
                  sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ))}
          </div>

          {/* Rows */}
          {sorted.map((q, idx) => {
            const isExpanded_ = expanded.has(q.questionId)
            const isLast = idx === sorted.length - 1
            const totalDuration = PHASE_KEYS.reduce(
              (sum, k) => sum + (q.phases[k].durationMs ?? 0),
              0
            )
            const searchResults = q.phases?.search?.results || []
            const isContextExpanded_ = contextExpanded.has(q.questionId)

            return (
              <div
                key={q.questionId}
                className={cn(
                  "transition-colors",
                  !isLast && !isExpanded_ && "border-b border-border"
                )}
              >
                {/* Row */}
                <div
                  className="grid grid-cols-[1fr_100px_60px_60px_60px_60px] gap-0 px-4 py-3 items-center cursor-pointer hover:bg-bg-surface-hover/50 transition-colors"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (isExpanded_) next.delete(q.questionId)
                      else next.add(q.questionId)
                      return next
                    })
                  }
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform",
                        isExpanded_ && "rotate-180"
                      )}
                    />
                    <span className="text-sm text-text-primary truncate">{q.questionId}</span>
                  </div>
                  <span className="text-xs text-text-muted truncate">
                    {questionTypeRegistry?.[q.questionType]?.alias ||
                      q.questionType.replace(/[-_]/g, " ")}
                  </span>
                  {PHASE_KEYS.map((key) => (
                    <PhaseDot
                      key={key}
                      status={q.phases[key].status}
                      phase={key}
                      question={q}
                    />
                  ))}
                </div>

                {/* Expanded detail */}
                {isExpanded_ && (
                  <div
                    className={cn(
                      "px-4 pb-4 pt-3 bg-bg-surface/30 border-t border-border",
                      !isLast && "border-b border-border"
                    )}
                  >
                    {/* Container tag */}
                    {q.containerTag && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(q.containerTag).then(() => {
                            setCopiedTag(q.questionId)
                            setTimeout(() => setCopiedTag((prev) => prev === q.questionId ? null : prev), 2000)
                          })
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs transition-colors mb-3 max-w-full min-w-0",
                          copiedTag === q.questionId
                            ? "text-status-success"
                            : "text-text-muted hover:text-text-primary"
                        )}
                        title="Click to copy"
                      >
                        <span className="font-mono truncate min-w-0">{q.containerTag}</span>
                        {copiedTag === q.questionId ? (
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 flex-shrink-0" />
                        )}
                      </button>
                    )}

                    {/* Phase timing */}
                    <div className="flex items-center gap-4 mb-3">
                      {PHASE_KEYS.map((key) => {
                        const phase = q.phases[key]
                        return (
                          <div key={key} className="text-xs">
                            <span className="text-text-muted">{PHASE_LABELS[key]}:</span>{" "}
                            <span className="text-text-secondary tabular-nums">
                              {phase.durationMs != null
                                ? formatDuration(phase.durationMs)
                                : phase.status === "in_progress"
                                  ? "running..."
                                  : "—"}
                            </span>
                          </div>
                        )
                      })}
                      {totalDuration > 0 && (
                        <div className="text-xs ml-auto">
                          <span className="text-text-muted">Total:</span>{" "}
                          <span className="text-text-primary tabular-nums">
                            {formatDuration(totalDuration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Question text */}
                    <div className="mb-3">
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Question</div>
                      <p className="text-sm text-text-primary">{q.question}</p>
                    </div>

                    {/* Ground truth */}
                    <div className="mb-3">
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Ground Truth</div>
                      <p className="text-sm text-text-primary bg-bg-elevated px-3 py-2 rounded-lg break-words">
                        {q.groundTruth}
                      </p>
                    </div>

                    {/* Evaluation explanation */}
                    {q.phases.evaluate.explanation && (
                      <div className="mb-3">
                        <div className="text-xs text-text-muted uppercase tracking-wide mb-1">
                          Explanation
                        </div>
                        <p className="text-sm text-text-secondary">{q.phases.evaluate.explanation}</p>
                      </div>
                    )}

                    {/* Phase errors */}
                    {PHASE_KEYS.map((key) => {
                      const error = q.phases[key].error
                      if (!error) return null
                      return (
                        <div key={key} className="mb-3">
                          <div className="text-xs text-status-error uppercase tracking-wide mb-1">
                            {PHASE_LABELS[key]} Error
                          </div>
                          <p className="text-sm text-text-secondary bg-status-error/5 border border-status-error/20 px-3 py-2 rounded-lg">
                            {error}
                          </p>
                        </div>
                      )
                    })}

                    {/* Retrieved Context — collapsible */}
                    {searchResults.length > 0 && (
                      <div className="mt-1 border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setContextExpanded((prev) => {
                              const next = new Set(prev)
                              if (isContextExpanded_) next.delete(q.questionId)
                              else next.add(q.questionId)
                              return next
                            })
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-elevated/60 hover:bg-bg-surface transition-colors cursor-pointer"
                        >
                          <span className="text-xs text-text-muted uppercase tracking-wide">
                            Retrieved Context ({searchResults.length} results)
                          </span>
                          <ChevronDown
                            className={cn(
                              "w-3.5 h-3.5 text-text-muted transition-transform",
                              isContextExpanded_ && "rotate-180"
                            )}
                          />
                        </button>

                        {isContextExpanded_ && (
                          <div className="p-3 space-y-2">
                            {searchResults.map((result: any, ridx: number) => {
                              const jsonStr = JSON.stringify(result, null, 2)
                              return (
                                <div
                                  key={ridx}
                                  className="bg-bg-primary rounded-lg border border-border overflow-hidden relative"
                                >
                                  {(searchResults.length > 1 || result.score !== undefined) && (
                                    <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
                                      {searchResults.length > 1 && (
                                        <span className="text-xs text-text-muted">#{ridx + 1}</span>
                                      )}
                                      {result.score !== undefined && (
                                        <span className="text-xs text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded-lg">
                                          {typeof result.score === "number"
                                            ? result.score.toFixed(3)
                                            : result.score}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <Highlight theme={themes.oneDark} code={jsonStr} language="json">
                                    {({ style, tokens, getLineProps, getTokenProps }) => (
                                      <pre
                                        className="p-3 overflow-x-auto text-sm max-h-[300px] overflow-y-auto"
                                        style={{ ...style, background: "transparent", margin: 0 }}
                                      >
                                        {tokens.map((line, i) => (
                                          <div key={i} {...getLineProps({ line })}>
                                            {line.map((token, key) => (
                                              <span key={key} {...getTokenProps({ token })} />
                                            ))}
                                          </div>
                                        ))}
                                      </pre>
                                    )}
                                  </Highlight>
                                </div>
                              )
                            })}
                          </div>
                        )}
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
