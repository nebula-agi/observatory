import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { X, Pencil, ChevronRight, Play } from "lucide-react"
import {
  getProviders,
  getModels,
  startRun,
  preflightRun,
  type RunSummary,
  type PhaseId,
  PHASE_ORDER,
  type Provider,
} from "@/lib/api"
import { SingleSelect } from "@/components/single-select"
import { SegmentedControl } from "@/components/segmented-control"
import { generateRunId } from "@/lib/utils"

interface ForkRunModalProps {
  isOpen: boolean
  onClose: () => void
  sourceRun: RunSummary
  onRunStarted: (runId: string) => void
}

export function ForkRunModal({ isOpen, onClose, sourceRun, onRunStarted }: ForkRunModalProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<any>({})

  const [fromPhase, setFromPhase] = useState<PhaseId>("search")
  const [judgeModel, setJudgeModel] = useState(sourceRun.judge)
  const [newRunId, setNewRunId] = useState("")
  const [editingRunId, setEditingRunId] = useState(false)
  const [editingConcurrency, setEditingConcurrency] = useState(false)
  const [showPerPhase, setShowPerPhase] = useState(false)
  const [editingPhase, setEditingPhase] = useState<string | null>(null)
  const [concurrency, setConcurrency] = useState({
    default: 1 as number | undefined,
    ingest: undefined as number | undefined,
    indexing: undefined as number | undefined,
    search: undefined as number | undefined,
    evaluate: undefined as number | undefined,
  })

  const runIdInputRef = useRef<HTMLInputElement>(null)
  const concurrencyInputRef = useRef<HTMLInputElement>(null)
  const phaseInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const canChangeJudge = ["indexing", "search", "evaluate"].includes(fromPhase)

  useEffect(() => {
    if (editingRunId && runIdInputRef.current) {
      runIdInputRef.current.focus()
      runIdInputRef.current.select()
    }
  }, [editingRunId])

  useEffect(() => {
    if (editingConcurrency && concurrencyInputRef.current) {
      concurrencyInputRef.current.focus()
      concurrencyInputRef.current.select()
    }
  }, [editingConcurrency])

  useEffect(() => {
    if (editingPhase && phaseInputRefs.current[editingPhase]) {
      phaseInputRefs.current[editingPhase]?.focus()
      phaseInputRefs.current[editingPhase]?.select()
    }
  }, [editingPhase])

  // Generate default run ID
  useEffect(() => {
    setNewRunId(generateRunId(sourceRun.provider))
  }, [sourceRun])

  // Fetch providers + models
  useEffect(() => {
    if (!isOpen) return
    async function load() {
      try {
        const [providersRes, modelsRes] = await Promise.all([getProviders(), getModels()])
        setProviders(providersRes.providers)
        setModels(modelsRes.models)

        const sourceProvider = providersRes.providers.find(
          (p) => p.name === sourceRun.provider
        )
        if (sourceProvider) {
          setConcurrency({
            default: sourceProvider.concurrency?.default ?? 1,
            ingest: sourceProvider.concurrency?.ingest,
            indexing: sourceProvider.concurrency?.indexing,
            search: sourceProvider.concurrency?.search,
            evaluate: sourceProvider.concurrency?.evaluate,
          })
        }
      } catch {
        // Non-critical — user can still submit with defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isOpen, sourceRun])

  // Lock judge model when phase doesn't allow changes
  useEffect(() => {
    if (!canChangeJudge) {
      setJudgeModel(sourceRun.judge)
    }
  }, [fromPhase, sourceRun.judge, canChangeJudge])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const allModels = [...Object.values(models).flat()] as {
    alias: string
    displayName: string
  }[]
  const modelOptions = allModels.map((m) => ({
    value: m.alias,
    label: m.displayName || m.alias,
  }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newRunId) {
      setError("Please enter a run ID")
      return
    }

    const hasNonDefaultConcurrency =
      (concurrency.default !== undefined && concurrency.default !== 1) ||
      concurrency.ingest !== undefined ||
      concurrency.indexing !== undefined ||
      concurrency.search !== undefined ||
      concurrency.evaluate !== undefined

    const concurrencyPayload = hasNonDefaultConcurrency
      ? {
          ...(concurrency.default !== undefined && { default: concurrency.default }),
          ...(concurrency.ingest !== undefined && { ingest: concurrency.ingest }),
          ...(concurrency.indexing !== undefined && { indexing: concurrency.indexing }),
          ...(concurrency.search !== undefined && { search: concurrency.search }),
          ...(concurrency.evaluate !== undefined && { evaluate: concurrency.evaluate }),
        }
      : undefined

    try {
      setSubmitting(true)
      setError(null)

      const preflight = await preflightRun({
        provider: sourceRun.provider,
        judgeModel,
      })

      if (!preflight.valid) {
        const labels: Record<string, string> = {
          supermemory: "Supermemory",
          mem0: "Mem0",
          zep: "Zep",
          nebula: "Nebula",
          openai: "OpenAI",
          anthropic: "Anthropic",
          google: "Google",
        }
        const names = preflight.missing.map((k) => labels[k] || k).join(", ")
        setError(`Missing API keys: ${names}. Add them in Settings before starting a run.`)
        setSubmitting(false)
        return
      }

      await startRun({
        provider: sourceRun.provider,
        benchmark: sourceRun.benchmark,
        runId: newRunId,
        judgeModel,
        concurrency: concurrencyPayload,
        force: false,
        fromPhase,
        sourceRunId: sourceRun.runId,
      })

      onRunStarted(newRunId)
      navigate(`/runs/${encodeURIComponent(newRunId)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run")
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-surface/95 backdrop-blur-xl border border-border rounded-lg w-full max-w-lg p-6 shadow-glass animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-display text-lg font-medium text-text-primary mb-1">
          Fork from Checkpoint
        </h2>
        <p className="text-sm text-text-secondary mb-5">
          Create a new run using checkpoint data from an existing run.
        </p>

        {/* Source run info */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-5 p-3 rounded-lg bg-bg-primary/60 border border-border">
          <div className="text-sm">
            <span className="text-text-muted">Source:</span>{" "}
            <span className="text-text-primary font-medium font-mono text-xs">
              {sourceRun.runId}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-text-muted">Accuracy:</span>{" "}
            <span className="text-text-primary font-medium">
              {sourceRun.accuracy !== null
                ? `${(sourceRun.accuracy * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-text-muted">Provider:</span>{" "}
            <span className="text-text-primary font-medium capitalize">
              {sourceRun.provider}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-text-muted">Benchmark:</span>{" "}
            <span className="text-text-primary font-medium capitalize">
              {sourceRun.benchmark}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phase selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
              Start from phase
            </label>
            <SegmentedControl
              options={PHASE_ORDER.map((phase) => ({
                value: phase,
                label: phase.charAt(0).toUpperCase() + phase.slice(1),
                disabled: phase === "ingest",
              }))}
              selected={fromPhase}
              onChange={setFromPhase}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Copies data up to this phase, then re-executes from here.
            </p>
          </div>

          {/* Judge Model */}
          {canChangeJudge && !loading && (
            <div>
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                Judge Model
              </label>
              <SingleSelect
                label="Judge Model"
                options={modelOptions}
                selected={judgeModel}
                onChange={setJudgeModel}
                placeholder="Select model"
              />
            </div>
          )}

          {/* Concurrency */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Concurrency
                </label>
                {!showPerPhase &&
                  (editingConcurrency ? (
                    <input
                      ref={concurrencyInputRef}
                      type="number"
                      className="w-14 px-2 py-0.5 text-sm bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                      value={concurrency.default ?? ""}
                      onChange={(e) =>
                        setConcurrency({
                          ...concurrency,
                          default: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      onBlur={() => setEditingConcurrency(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape")
                          setEditingConcurrency(false)
                      }}
                      min="1"
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-sm text-text-primary hover:text-accent transition-colors cursor-pointer"
                      onClick={() => setEditingConcurrency(true)}
                    >
                      <span className="font-medium">{concurrency.default ?? 1}</span>
                      <Pencil className="w-3 h-3 text-text-muted" />
                    </button>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setShowPerPhase(!showPerPhase)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${showPerPhase ? "rotate-90" : ""}`}
                />
                <span>Per-phase</span>
              </button>
            </div>

            {showPerPhase && (
              <div className="mt-2 space-y-1.5">
                {(["ingest", "indexing", "search", "evaluate"] as const).map((phase) => (
                  <div key={phase} className="flex items-center gap-3 h-7">
                    <span className="text-sm text-text-secondary capitalize w-20">{phase}:</span>
                    {editingPhase === phase ? (
                      <input
                        ref={(el) => {
                          phaseInputRefs.current[phase] = el
                        }}
                        type="number"
                        className="w-14 px-2 py-0.5 text-sm bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                        value={concurrency[phase] ?? ""}
                        onChange={(e) =>
                          setConcurrency({
                            ...concurrency,
                            [phase]: e.target.value ? parseInt(e.target.value) : undefined,
                          })
                        }
                        onBlur={() => setEditingPhase(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setEditingPhase(null)
                        }}
                        placeholder={String(concurrency.default ?? 1)}
                        min="1"
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-text-primary hover:text-accent transition-colors cursor-pointer"
                        onClick={() => setEditingPhase(phase)}
                      >
                        <span
                          className={
                            concurrency[phase] !== undefined ? "font-medium" : "text-text-muted"
                          }
                        >
                          {concurrency[phase] ?? concurrency.default ?? 1}
                        </span>
                        <Pencil className="w-3 h-3 text-text-muted" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Run ID */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
              New Run ID
            </label>
            {!editingRunId ? (
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-text-primary hover:text-accent transition-colors cursor-pointer"
                onClick={() => setEditingRunId(true)}
              >
                <span className="font-mono text-xs lowercase">{newRunId}</span>
                <Pencil className="w-3 h-3 text-text-muted" />
              </button>
            ) : (
              <input
                ref={runIdInputRef}
                type="text"
                value={newRunId}
                onChange={(e) => setNewRunId(e.target.value)}
                onBlur={() => setEditingRunId(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditingRunId(false)
                }}
                className="w-full px-3 py-1.5 text-sm font-mono bg-bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent lowercase"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !newRunId}
              className="nebula-btn flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors tracking-tight bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Fork & Start</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary border border-border hover:border-border-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
