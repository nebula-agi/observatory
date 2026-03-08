import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { getRuns, deleteRun, stopRun, startRun, preflightRun, type RunSummary } from "@/lib/api"
import { formatDate, cn } from "@/lib/utils"
import { MultiSelect } from "@/components/multi-select"
import { DataTable, type Column } from "@/components/data-table"
import { RunActionsMenu } from "@/components/run-actions-menu"
import { NewRunForm } from "@/components/new-run-form"
import { ForkRunModal } from "@/components/fork-run-modal"
import { useAuth } from "@/hooks/useAuth"
import { Search, ChevronDown, LogIn } from "lucide-react"

const POLL_INTERVAL = 2000 // 2 seconds

export default function RunsPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forkSource, setForkSource] = useState<RunSummary | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Filters
  const [search, setSearch] = useState("")
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Check if any run is in progress
  const hasRunningRuns = useMemo(() => {
    return runs.some(
      (r) => r.status === "running" || r.status === "pending" || r.status === "initializing"
    )
  }, [runs])

  // Silent refresh (no loading state)
  const refreshRuns = useCallback(async () => {
    try {
      const data = await getRuns()
      setRuns(data)
      setError(null)
    } catch (e) {
      // Silent fail on poll
    }
  }, [])

  // Load runs on mount and when auth state changes
  useEffect(() => {
    if (!authLoading && user) {
      loadRuns()
    } else if (!authLoading) {
      setRuns([])
      setLoading(false)
    }
  }, [user, authLoading])

  // Polling when runs are in progress
  useEffect(() => {
    if (hasRunningRuns) {
      pollIntervalRef.current = setInterval(refreshRuns, POLL_INTERVAL)
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [hasRunningRuns, refreshRuns])

  async function loadRuns() {
    try {
      setLoading(true)
      const data = await getRuns()
      setRuns(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(runId: string) {
    if (!confirm(`Delete run "${runId}"?`)) return

    const cleanup = confirm(
      "Also clear provider collections?\n\nClick OK to clean up provider data (recommended)\nClick Cancel to delete only run files"
    )

    try {
      await deleteRun(runId, cleanup)
      setRuns((prev) => prev.filter((r) => r.runId !== runId))
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete run")
    }
  }

  async function handleTerminate(runId: string) {
    try {
      await stopRun(runId)
      await refreshRuns()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to terminate run")
    }
  }

  async function handleContinue(run: RunSummary) {
    try {
      const preflight = await preflightRun({
        provider: run.provider,
        judgeModel: run.judge,
      })
      if (!preflight.valid) {
        const labels: Record<string, string> = {
          supermemory: "Supermemory", mem0: "Mem0", zep: "Zep", nebula: "Nebula",
          openai: "OpenAI", anthropic: "Anthropic", google: "Google",
        }
        const names = preflight.missing.map((k) => labels[k] || k).join(", ")
        alert(`Missing API keys: ${names}. Add them in Settings before continuing.`)
        return
      }
      await startRun({
        provider: run.provider,
        benchmark: run.benchmark,
        runId: run.runId,
        judgeModel: run.judge,
      })
      await refreshRuns()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to continue run")
    }
  }

  // Get unique values for filter options
  const providers = useMemo(() => {
    const counts: Record<string, number> = {}
    runs.forEach((r) => {
      counts[r.provider] = (counts[r.provider] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
  }, [runs])

  const benchmarks = useMemo(() => {
    const counts: Record<string, number> = {}
    runs.forEach((r) => {
      counts[r.benchmark] = (counts[r.benchmark] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
  }, [runs])

  const statuses = useMemo(() => {
    const counts: Record<string, number> = {}
    runs.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
  }, [runs])

  // Filter runs
  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          run.runId.toLowerCase().includes(searchLower) ||
          run.provider.toLowerCase().includes(searchLower) ||
          run.benchmark.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      if (selectedProviders.length > 0 && !selectedProviders.includes(run.provider)) {
        return false
      }

      if (selectedBenchmarks.length > 0 && !selectedBenchmarks.includes(run.benchmark)) {
        return false
      }

      if (selectedStatuses.length > 0 && !selectedStatuses.includes(run.status)) {
        return false
      }

      return true
    })
  }, [runs, search, selectedProviders, selectedBenchmarks, selectedStatuses])

  const hasActiveFilters =
    search !== "" ||
    selectedProviders.length > 0 ||
    selectedBenchmarks.length > 0 ||
    selectedStatuses.length > 0

  // Render a column header that doubles as a filter trigger
  const renderFilterTrigger =
    (name: string) =>
    ({ selected, open }: { selected: string[]; open: boolean }) => (
      <span
        className={cn(
          "flex items-center gap-1.5 transition-colors",
          selected.length > 0 ? "text-accent" : "text-text-secondary hover:text-text-primary"
        )}
      >
        <span className="text-xs font-medium uppercase tracking-wider">{name}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 flex-shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
        {selected.length > 0 && (
          <span className="text-[10px] bg-accent/15 text-accent rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
            {selected.length}
          </span>
        )}
      </span>
    )

  // Build columns
  const columns: Column<RunSummary>[] = useMemo(
    () => [
      {
        key: "runId",
        header: "Run ID",
        filterElement: (
          <MultiSelect
            label="Status"
            options={statuses}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            renderTrigger={renderFilterTrigger("Status")}
          />
        ),
        render: (run) => {
          const isActive =
            run.status === "running" ||
            run.status === "pending" ||
            run.status === "initializing" ||
            run.status === "stopping"
          const s = run.summary
          const phasesCompleted = s.ingested + s.indexed + s.searched + s.evaluated
          const totalPhases = 4 * s.total
          const progress = totalPhases > 0 ? phasesCompleted / totalPhases : 0

          let phasesFullyComplete = 0
          if (s.ingested === s.total) phasesFullyComplete++
          if (s.indexed === s.total) phasesFullyComplete++
          if (s.searched === s.total) phasesFullyComplete++
          if (s.evaluated === s.total) phasesFullyComplete++

          const statusConfig: Record<string, { dotColor: string; barColor: string; label: string }> = {
            completed: { dotColor: "bg-status-success", barColor: "bg-status-success", label: "Completed" },
            failed: { dotColor: "bg-status-error", barColor: "bg-status-error", label: "Failed" },
            partial: { dotColor: "bg-status-warning", barColor: "bg-status-warning", label: "Partial" },
            running: { dotColor: "bg-accent", barColor: "bg-accent", label: "Running" },
            initializing: { dotColor: "bg-accent", barColor: "bg-accent", label: "Initializing" },
            pending: { dotColor: "bg-text-muted", barColor: "bg-text-muted", label: "Pending" },
            stopping: { dotColor: "bg-status-warning", barColor: "bg-status-warning", label: "Stopping" },
          }
          const config = statusConfig[run.status] ?? statusConfig.pending

          const phases = ["ingest", "indexing", "search", "evaluate"] as const
          const phaseCounts = [s.ingested, s.indexed, s.searched, s.evaluated]
          const tooltipLines = [
            `${config.label} — ${Math.round(progress * 100)}%`,
            ...phases.map((p, i) => `${p}: ${phaseCounts[i]}/${s.total}`),
          ]
          const tooltip = tooltipLines.join("\n")

          return (
            <div className="flex items-center gap-2.5">
              <div className="relative group flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center" title={tooltip}>
                {isActive ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-accent phase-dot-active" />
                ) : (
                  <span className={cn("w-2 h-2 rounded-full", config.dotColor)} />
                )}
              </div>
              <span className="text-text-primary">{run.runId}</span>
              {isActive && s.total > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <div className="w-16 h-1 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", config.barColor)}
                      style={{ width: `${Math.max(progress * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted">{phasesFullyComplete}/4</span>
                </div>
              )}
            </div>
          )
        },
      },
      {
        key: "provider",
        header: "Provider",
        filterElement: (
          <MultiSelect
            label="Provider"
            options={providers}
            selected={selectedProviders}
            onChange={setSelectedProviders}
            renderTrigger={renderFilterTrigger("Provider")}
          />
        ),
        render: (run) => <span className="capitalize">{run.provider}</span>,
      },
      {
        key: "benchmark",
        header: "Benchmark",
        filterElement: (
          <MultiSelect
            label="Benchmark"
            options={benchmarks}
            selected={selectedBenchmarks}
            onChange={setSelectedBenchmarks}
            renderTrigger={renderFilterTrigger("Benchmark")}
          />
        ),
        render: (run) => <span className="capitalize">{run.benchmark}</span>,
      },
      {
        key: "accuracy",
        header: "Accuracy",
        align: "right",
        render: (run) => {
          const accuracyPct =
            run.accuracy !== null && run.accuracy !== undefined
              ? (run.accuracy * 100).toFixed(0)
              : null
          return accuracyPct ? (
            <span>{accuracyPct}%</span>
          ) : (
            <span className="text-text-muted">—</span>
          )
        },
      },
      {
        key: "date",
        header: "Date",
        render: (run) => (
          <span className="text-text-secondary text-sm">{formatDate(run.createdAt)}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "40px",
        align: "right",
        render: (run) => (
          <RunActionsMenu
            runId={run.runId}
            status={run.status}
            onDelete={() => handleDelete(run.runId)}
            onTerminate={() => handleTerminate(run.runId)}
            onContinue={() => handleContinue(run)}
            onFork={() => setForkSource(run)}
          />
        ),
      },
    ],
    [search, providers, selectedProviders, benchmarks, selectedBenchmarks, statuses, selectedStatuses]
  )

  const clearFilters = () => {
    setSearch("")
    setSelectedProviders([])
    setSelectedBenchmarks([])
    setSelectedStatuses([])
  }

  if (!authLoading && !user) {
    return (
      <div className="stagger-fade-in">
        <div className="mb-6">
          <h1 className="text-3xl font-display font-medium text-text-primary tracking-tight">
            Runs
          </h1>
          <p className="text-text-secondary mt-1">
            Start and monitor benchmark evaluations.
          </p>
        </div>
        <div className="py-16 text-center">
          <LogIn className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <p className="text-text-secondary mb-1">Sign in to run your own benchmarks.</p>
          <p className="text-text-muted text-sm">
            Your runs, results, and API keys are saved to your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="stagger-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-display font-medium text-text-primary tracking-tight">
          Runs
        </h1>
        <p className="text-text-secondary mt-1">
          Start and monitor benchmark evaluations.
        </p>
      </div>

      {/* New Run Form */}
      <div className="mb-8">
        <NewRunForm onRunStarted={refreshRuns} />
      </div>

      {/* Runs Table */}
      <div>
        {!loading && runs.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
            <div className="relative flex items-center">
              <Search className="absolute left-0 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search runs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-44 pl-5 text-sm bg-transparent text-text-primary placeholder-text-muted border-0 focus:outline-none cursor-text"
              />
            </div>
            {hasActiveFilters && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted text-xs">
                  {filteredRuns.length} of {runs.length}
                </span>
                <button
                  onClick={clearFilters}
                  className="text-text-muted hover:text-text-primary transition-colors cursor-pointer text-xs"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-text-secondary mt-3">Loading runs...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-status-error">{error}</p>
            <button className="btn btn-secondary mt-3" onClick={loadRuns}>
              Retry
            </button>
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-text-muted py-8 text-center">
            No runs yet. Configure and start one above.
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRuns}
            onRowClick={(run) => navigate(`/runs/${encodeURIComponent(run.runId)}`)}
            emptyMessage="No runs match your filters"
            getRowKey={(run) => run.runId}
            connectToFilterBar={false}
          />
        )}
      </div>

      {/* Fork from Checkpoint Modal */}
      {forkSource && (
        <ForkRunModal
          isOpen={!!forkSource}
          onClose={() => setForkSource(null)}
          sourceRun={forkSource}
          onRunStarted={() => {
            setForkSource(null)
            refreshRuns()
          }}
        />
      )}
    </div>
  )
}
