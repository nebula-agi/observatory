import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Pencil, ChevronRight, Play } from "lucide-react"
import {
  getProviders,
  getBenchmarks,
  getModels,
  startRun,
  preflightRun,
  type SelectionMode,
  type SampleType,
  type SamplingConfig,
  type Provider,
} from "@/lib/api"
import { SingleSelect } from "@/components/single-select"
import { generateRunId } from "@/lib/utils"

interface NewRunFormProps {
  onRunStarted: (runId: string) => void
}

export function NewRunForm({ onRunStarted }: NewRunFormProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [showPerPhase, setShowPerPhase] = useState(false)

  const [providers, setProviders] = useState<Provider[]>([])
  const [benchmarks, setBenchmarks] = useState<{ name: string; displayName: string }[]>([])
  const [models, setModels] = useState<any>({})

  const [form, setForm] = useState({
    provider: "",
    benchmark: "",
    runId: "",
    judgeModel: "gemini-3-flash-preview",
    selectionMode: "full" as SelectionMode,
    sampleType: "consecutive" as SampleType,
    perCategory: "2",
    limit: "",
    concurrency: {
      default: undefined as number | undefined,
      ingest: undefined as number | undefined,
      indexing: undefined as number | undefined,
      search: undefined as number | undefined,
      evaluate: undefined as number | undefined,
    },
  })

  const [defaultRunId, setDefaultRunId] = useState("")
  const [editingRunId, setEditingRunId] = useState(false)
  const [editingConcurrency, setEditingConcurrency] = useState(false)
  const [editingPhase, setEditingPhase] = useState<string | null>(null)
  const runIdInputRef = useRef<HTMLInputElement>(null)
  const concurrencyInputRef = useRef<HTMLInputElement>(null)
  const phaseInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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

  // Update default run ID synchronously when provider changes (avoids race with submit)
  function updateProvider(provider: string) {
    setForm((f) => ({ ...f, provider }))
    if (!form.runId) {
      setDefaultRunId(generateRunId(provider))
    }
  }

  useEffect(() => {
    loadOptions()
  }, [])

  const selectedProvider = providers.find((p) => p.name === form.provider)

  useEffect(() => {
    if (selectedProvider) {
      setForm((f) => ({
        ...f,
        concurrency: {
          default: selectedProvider.concurrency?.default ?? 1,
          ingest: selectedProvider.concurrency?.ingest,
          indexing: selectedProvider.concurrency?.indexing,
          search: selectedProvider.concurrency?.search,
          evaluate: selectedProvider.concurrency?.evaluate,
        },
      }))
    }
  }, [form.provider, providers])

  async function loadOptions() {
    try {
      const [providersRes, benchmarksRes, modelsRes] = await Promise.all([
        getProviders(),
        getBenchmarks(),
        getModels(),
      ])
      setProviders(providersRes.providers)
      setBenchmarks(benchmarksRes.benchmarks)
      setModels(modelsRes.models)

      if (providersRes.providers.length > 0) {
        const defaultProvider =
          providersRes.providers.find((p) => p.name === "nebula") || providersRes.providers[0]
        setForm((f) => ({
          ...f,
          provider: defaultProvider.name,
          concurrency: {
            default: defaultProvider.concurrency?.default ?? 1,
            ingest: defaultProvider.concurrency?.ingest,
            indexing: defaultProvider.concurrency?.indexing,
            search: defaultProvider.concurrency?.search,
            evaluate: defaultProvider.concurrency?.evaluate,
          },
        }))
        setDefaultRunId(generateRunId(defaultProvider.name))
      }
      if (benchmarksRes.benchmarks.length > 0) {
        const defaultBenchmark =
          benchmarksRes.benchmarks.find((b) => b.name === "longmemeval") ||
          benchmarksRes.benchmarks[0]
        setForm((f) => ({ ...f, benchmark: defaultBenchmark.name }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load options")
    } finally {
      setLoading(false)
    }
  }

  const displayRunId = form.runId || defaultRunId || "run-id"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const runId = form.runId || defaultRunId

    let sampling: SamplingConfig | undefined
    if (form.selectionMode === "full") {
      sampling = { mode: "full" }
    } else if (form.selectionMode === "sample") {
      sampling = {
        mode: "sample",
        sampleType: form.sampleType,
        perCategory: parseInt(form.perCategory) || 2,
      }
    } else if (form.selectionMode === "limit" && form.limit) {
      sampling = { mode: "limit", limit: parseInt(form.limit) }
    }

    const hasNonDefaultConcurrency =
      (form.concurrency.default !== undefined && form.concurrency.default !== 1) ||
      form.concurrency.ingest !== undefined ||
      form.concurrency.indexing !== undefined ||
      form.concurrency.search !== undefined ||
      form.concurrency.evaluate !== undefined

    const concurrency = hasNonDefaultConcurrency
      ? {
          ...(form.concurrency.default !== undefined && { default: form.concurrency.default }),
          ...(form.concurrency.ingest !== undefined && { ingest: form.concurrency.ingest }),
          ...(form.concurrency.indexing !== undefined && { indexing: form.concurrency.indexing }),
          ...(form.concurrency.search !== undefined && { search: form.concurrency.search }),
          ...(form.concurrency.evaluate !== undefined && { evaluate: form.concurrency.evaluate }),
        }
      : undefined

    try {
      setSubmitting(true)
      setError(null)

      const preflight = await preflightRun({
        provider: form.provider,
        judgeModel: form.judgeModel,
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
        provider: form.provider,
        benchmark: form.benchmark,
        runId,
        judgeModel: form.judgeModel,
        sampling,
        concurrency,
        force: false,
      })

      onRunStarted(runId)
      navigate(`/runs/${encodeURIComponent(runId)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run")
      setSubmitting(false)
    }
  }

  const allModels = [...Object.values(models).flat()] as {
    alias: string
    displayName: string
  }[]

  const providerOptions = providers.map((p) => ({ value: p.name, label: p.displayName }))
  const benchmarkOptions = benchmarks
    .map((b) => ({ value: b.name, label: b.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const modelOptions = allModels.map((m) => ({
    value: m.alias,
    label: m.displayName || m.alias,
  }))

  // Skeleton loading state
  if (loading) {
    return (
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-[42px] rounded-lg bg-bg-elevated/50 animate-pulse" />
          <div className="h-[42px] rounded-lg bg-bg-elevated/50 animate-pulse" />
          <div className="h-[42px] rounded-lg bg-bg-elevated/50 animate-pulse" />
        </div>
        <div className="flex items-center gap-4 mt-4">
          <div className="h-9 w-28 rounded-lg bg-bg-elevated/50 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <form onSubmit={handleSubmit}>
        {/* Row 1: Three dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SingleSelect
            label="Provider"
            options={providerOptions}
            selected={form.provider}
            onChange={updateProvider}
            placeholder="Provider"
          />
          <SingleSelect
            label="Benchmark"
            options={benchmarkOptions}
            selected={form.benchmark}
            onChange={(value) => setForm({ ...form, benchmark: value })}
            placeholder="Benchmark"
          />
          <SingleSelect
            label="Judge Model"
            options={modelOptions}
            selected={form.judgeModel}
            onChange={(value) => setForm({ ...form, judgeModel: value })}
            placeholder="Judge Model"
          />
        </div>

        {/* Row 2: Start button + Options toggle */}
        <div className="flex items-center justify-between mt-4">
          <button
            type="submit"
            disabled={submitting || !form.provider || !form.benchmark}
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
                <span>Start Run</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setOptionsOpen(!optionsOpen)}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${optionsOpen ? "rotate-90" : ""}`}
            />
            <span>Options</span>
          </button>
        </div>

        {/* Options disclosure */}
        {optionsOpen && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            {/* Question Selection */}
            <div>
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                Questions
              </label>
              <div className="flex gap-0">
                {(["full", "sample", "limit"] as SelectionMode[]).map((mode) => {
                  const isSelected = form.selectionMode === mode
                  const labels = { full: "Full", sample: "Sample", limit: "Limit" }
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, selectionMode: mode })}
                      className="px-3 py-1.5 text-sm font-medium transition-colors border-t border-b border-r first:border-l first:rounded-l-lg last:rounded-r-lg cursor-pointer"
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        backgroundColor: isSelected ? "#0a0a14" : "transparent",
                        borderColor: isSelected
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(255,255,255,0.12)",
                        color: isSelected ? "#ffffff" : "#8888a0",
                      }}
                    >
                      {labels[mode]}
                    </button>
                  )
                })}
              </div>

              {form.selectionMode === "sample" && (
                <div className="flex items-center gap-3 mt-3">
                  <input
                    type="number"
                    className="w-16 px-3 py-1.5 text-sm bg-bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    value={form.perCategory}
                    onChange={(e) => setForm({ ...form, perCategory: e.target.value })}
                    placeholder="2"
                    min="1"
                  />
                  <span className="text-sm text-text-secondary mr-4">per category</span>
                  <div className="flex gap-0">
                    {(["consecutive", "random"] as SampleType[]).map((type) => {
                      const isSelected = form.sampleType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm({ ...form, sampleType: type })}
                          className="px-3 py-1.5 text-sm font-medium transition-colors border-t border-b border-r first:border-l first:rounded-l-lg last:rounded-r-lg cursor-pointer"
                          style={{
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            backgroundColor: isSelected ? "#0a0a14" : "transparent",
                            borderColor: isSelected
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(255,255,255,0.12)",
                            color: isSelected ? "#ffffff" : "#8888a0",
                          }}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {form.selectionMode === "limit" && (
                <div className="mt-3">
                  <input
                    type="number"
                    className="w-32 px-3 py-1.5 text-sm bg-bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    value={form.limit}
                    onChange={(e) => setForm({ ...form, limit: e.target.value })}
                    placeholder="e.g. 100"
                    min="1"
                  />
                </div>
              )}
            </div>

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
                        value={form.concurrency.default ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            concurrency: {
                              ...form.concurrency,
                              default: e.target.value ? parseInt(e.target.value) : undefined,
                            },
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
                        <span className="font-medium">{form.concurrency.default ?? 1}</span>
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
                      <span className="text-sm text-text-secondary capitalize w-20">
                        {phase}:
                      </span>
                      {editingPhase === phase ? (
                        <input
                          ref={(el) => {
                            phaseInputRefs.current[phase] = el
                          }}
                          type="number"
                          className="w-14 px-2 py-0.5 text-sm bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                          value={form.concurrency[phase] ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              concurrency: {
                                ...form.concurrency,
                                [phase]: e.target.value ? parseInt(e.target.value) : undefined,
                              },
                            })
                          }
                          onBlur={() => setEditingPhase(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") setEditingPhase(null)
                          }}
                          placeholder={String(form.concurrency.default ?? 1)}
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
                              form.concurrency[phase] !== undefined
                                ? "font-medium"
                                : "text-text-muted"
                            }
                          >
                            {form.concurrency[phase] ?? form.concurrency.default ?? 1}
                          </span>
                          <Pencil className="w-3 h-3 text-text-muted" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run ID */}
            <div>
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                Run ID
              </label>
              {!editingRunId ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm text-text-primary hover:text-accent transition-colors cursor-pointer"
                  onClick={() => setEditingRunId(true)}
                >
                  <span className="font-mono text-xs lowercase">{displayRunId}</span>
                  <Pencil className="w-3 h-3 text-text-muted" />
                </button>
              ) : (
                <input
                  ref={runIdInputRef}
                  type="text"
                  value={form.runId || displayRunId}
                  onChange={(e) => setForm({ ...form, runId: e.target.value })}
                  onBlur={() => setEditingRunId(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setEditingRunId(false)
                  }}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent lowercase"
                />
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-sm">
            {error}
          </div>
        )}
      </form>
    </div>
  )
}
