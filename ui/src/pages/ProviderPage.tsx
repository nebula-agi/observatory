import { useState, useEffect, useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api"
import { RadarChart } from "@/components/radar-chart"
import { LatencyTable } from "@/components/benchmark-results"
import { cn } from "@/lib/utils"
import { ArrowLeft, ExternalLink } from "lucide-react"

export default function ProviderPage() {
  const { provider } = useParams<{ provider: string }>()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEntries()
  }, [provider])

  async function loadEntries() {
    try {
      setLoading(true)
      const { entries: all } = await getLeaderboard()
      setEntries(all.filter((e) => e.provider.toLowerCase() === provider?.toLowerCase()))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load provider data")
    } finally {
      setLoading(false)
    }
  }

  const latest = useMemo(
    () => entries.filter((e) => e.isLatest),
    [entries]
  )

  const bestAccuracy = useMemo(() => {
    if (latest.length === 0) return 0
    return Math.max(...latest.map((e) => e.accuracy))
  }, [latest])

  const avgLatency = useMemo(() => {
    const withLatency = latest.filter((e) => e.latencyStats?.total?.mean)
    if (withLatency.length === 0) return null
    const sum = withLatency.reduce((s, e) => s + (e.latencyStats?.total?.mean ?? 0), 0)
    return Math.round(sum / withLatency.length)
  }, [latest])

  const benchmarks = useMemo(
    () => [...new Set(latest.map((e) => e.benchmark))].sort(),
    [latest]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 text-text-secondary">
        <p>{error}</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to leaderboard
        </Link>
        <div className="text-center py-16 text-text-secondary">
          No data found for provider "{provider}"
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to leaderboard
      </Link>

      {/* Hero */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-text-primary capitalize">
              {provider}
            </h1>
            <p className="text-text-secondary mt-1">
              {latest.length > 0 && `Latest: ${latest[0].version}`}
              {benchmarks.length > 0 && ` \u00B7 ${benchmarks.length} benchmark${benchmarks.length > 1 ? "s" : ""}`}
              {` \u00B7 ${entries.length} total run${entries.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <StatBox label="Best Accuracy" value={`${(bestAccuracy * 100).toFixed(1)}%`} />
          <StatBox label="Avg Latency" value={avgLatency ? `${avgLatency}ms` : "\u2014"} />
          <StatBox label="Benchmarks" value={benchmarks.length} />
          <StatBox label="Total Runs" value={entries.length} />
        </div>
      </div>

      {/* Per-benchmark breakdown */}
      {benchmarks.map((benchmark) => {
        const entry = latest.find((e) => e.benchmark === benchmark)
        if (!entry) return null

        return (
          <div
            key={benchmark}
            className="bg-bg-surface/80 backdrop-blur-sm border border-border rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-display font-medium text-text-primary capitalize">
                {benchmark}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold text-text-primary tabular-nums">
                  {(entry.accuracy * 100).toFixed(1)}%
                </span>
                <span className="text-sm text-text-secondary">
                  {entry.correctCount}/{entry.totalQuestions}
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {entry.byQuestionType && Object.keys(entry.byQuestionType).length >= 3 && (
                <RadarChart data={entry.byQuestionType} />
              )}
              {entry.latencyStats && <LatencyTable latency={entry.latencyStats} />}
            </div>
          </div>
        )
      })}

      {/* Run history */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-border rounded-lg p-6">
        <h2 className="text-lg font-display font-medium text-text-primary mb-4">Run History</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_100px_100px_60px] gap-0 px-4 h-10 items-center bg-bg-surface/50 border-b border-border">
            <span className="text-[11px] text-text-muted uppercase tracking-widest">Run</span>
            <span className="text-[11px] text-text-muted uppercase tracking-widest">Benchmark</span>
            <span className="text-[11px] text-text-muted uppercase tracking-widest">Date</span>
            <span className="text-[11px] text-text-muted uppercase tracking-widest text-right">Accuracy</span>
            <span />
          </div>

          {entries
            .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
            .map((entry) => (
              <Link
                key={entry.id}
                to={`/leaderboard/${entry.id}`}
                className="grid grid-cols-[1fr_120px_100px_100px_60px] gap-0 px-4 py-3 items-center hover:bg-bg-surface-hover/50 transition-colors border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-text-primary truncate">
                    {entry.version}
                  </span>
                  {entry.isLatest && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent flex-shrink-0">
                      latest
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-muted capitalize">{entry.benchmark}</span>
                <span className="text-xs text-text-muted">
                  {new Date(entry.addedAt).toLocaleDateString()}
                </span>
                <span className="text-sm font-medium text-text-primary text-right tabular-nums">
                  {(entry.accuracy * 100).toFixed(1)}%
                </span>
                <div className="flex justify-end">
                  <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                </div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-surface/50 p-4 rounded-lg border border-border">
      <div className="text-xs text-text-muted/70 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  )
}
