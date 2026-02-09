import type { QuestionCheckpoint } from "@/lib/api"

interface LiveStatsProps {
  summary: {
    total: number
    evaluated: number
  }
  questions: QuestionCheckpoint[]
  elapsedMs: number
  isComplete?: boolean
  totalElapsedMs?: number
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function LiveStats({ summary, questions, elapsedMs, isComplete, totalElapsedMs }: LiveStatsProps) {
  // Throughput: evaluated questions per minute
  const effectiveElapsed = isComplete && totalElapsedMs ? totalElapsedMs : elapsedMs
  const elapsedMin = effectiveElapsed / 60000
  const throughput = elapsedMin > 0 ? summary.evaluated / elapsedMin : 0

  // Average latency: mean total duration of completed questions
  const completedQuestions = questions.filter((q) => q.phases.evaluate.status === "completed")
  const avgLatency = (() => {
    if (completedQuestions.length === 0) return 0
    const totalMs = completedQuestions.reduce((sum, q) => {
      const phases = q.phases
      const ingest = phases.ingest.durationMs ?? 0
      const indexing = phases.indexing.durationMs ?? 0
      const search = phases.search.durationMs ?? 0
      const evaluate = phases.evaluate.durationMs ?? 0
      return sum + ingest + indexing + search + evaluate
    }, 0)
    return totalMs / completedQuestions.length
  })()

  // Failures: questions with any failed phase
  const failures = questions.filter((q) => {
    const p = q.phases
    return (
      p.ingest.status === "failed" ||
      p.indexing.status === "failed" ||
      p.search.status === "failed" ||
      p.evaluate.status === "failed"
    )
  }).length

  // 4th stat: "Total Time" when complete, "Remaining" when running
  const remaining = summary.total - summary.evaluated

  const stats = [
    { label: "Throughput", value: throughput > 0 ? `${throughput.toFixed(1)} q/min` : "—" },
    { label: "Avg Latency", value: avgLatency > 0 ? formatDuration(avgLatency) : "—" },
    { label: "Failures", value: String(failures), highlight: failures > 0 },
    isComplete && totalElapsedMs
      ? { label: "Total Time", value: formatDuration(totalElapsedMs) }
      : { label: "Remaining", value: String(remaining) },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-bg-surface/50 p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{stat.label}</div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              stat.highlight ? "text-status-error" : "text-text-primary"
            }`}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
