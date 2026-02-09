import { useState, useEffect, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getLeaderboardEntry, type LeaderboardEntry } from "@/lib/api"
import { RadarChart } from "@/components/radar-chart"
import { AccuracyBarChart } from "@/components/accuracy-bar-chart"

export default function LeaderboardComparePage() {
  const [searchParams] = useSearchParams()
  const ids = useMemo(
    () =>
      (searchParams.get("ids") || "")
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n)),
    [searchParams]
  )

  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ids.length < 2) {
      setError("Select at least 2 entries to compare")
      setLoading(false)
      return
    }
    loadEntries()
  }, [ids])

  async function loadEntries() {
    try {
      setLoading(true)
      const results = await Promise.all(ids.map((id) => getLeaderboardEntry(id)))
      setEntries(results)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || entries.length < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error">{error || "Not enough entries to compare"}</p>
        <Link to="/leaderboard" className="btn btn-secondary mt-4">
          Back to Leaderboard
        </Link>
      </div>
    )
  }

  const benchmark = entries[0].benchmark
  const judge = entries[0].judgeModel

  const bestAccuracy = Math.max(...entries.map((e) => e.accuracy))
  const firstBestAccuracyIdx = entries.findIndex((e) => e.accuracy === bestAccuracy)

  return (
    <div className="stagger-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
        <Link to="/leaderboard" className="hover:text-text-primary">
          Leaderboard
        </Link>
        <span>/</span>
        <span className="text-text-primary">Compare</span>
      </div>

      {/* Header */}
      <div className="card mb-6">
        <h1 className="text-2xl font-display font-medium text-text-primary mb-2">
          Comparing {entries.length} entries
        </h1>
        <div className="flex items-center gap-4 text-sm text-text-secondary flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Providers:</span>
            <div className="flex gap-2">
              {entries.map((e) => (
                <span
                  key={e.id}
                  className="badge text-xs bg-accent/10 text-accent capitalize"
                >
                  {e.provider} ({e.version})
                </span>
              ))}
            </div>
          </div>
          <span>
            <span className="text-text-muted">Benchmark:</span>{" "}
            <span className="capitalize">{benchmark}</span>
          </span>
          <span>
            <span className="text-text-muted">Judge:</span> {judge}
          </span>
        </div>
      </div>

      {/* Radar Chart + Accuracy Table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RadarChart
          multiData={entries.map((e) => ({
            provider: e.provider,
            data: e.byQuestionType,
          }))}
        />

        {/* Accuracy Table */}
        <div className="card">
          <h3 className="text-sm font-medium text-text-primary font-display mb-3">
            Accuracy
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">
                  Provider
                </th>
                <th className="text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">
                  Version
                </th>
                <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const isBest = idx === firstBestAccuracyIdx
                return (
                  <tr key={entry.id} className="border-b border-border">
                    <td className="py-2 px-3 text-text-primary capitalize">
                      {entry.provider}
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{entry.version}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      <span
                        className={
                          isBest ? "text-status-success font-semibold" : "text-text-primary"
                        }
                      >
                        {(entry.accuracy * 100).toFixed(1)}%
                      </span>
                      <span className="ml-2 text-text-muted text-xs">
                        ({entry.correctCount}/{entry.totalQuestions})
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Latency Table */}
      <LatencyCompareTable entries={entries} />

      {/* Accuracy by Question Type */}
      <AccuracyByTypeSection entries={entries} />
    </div>
  )
}

function LatencyCompareTable({ entries }: { entries: LeaderboardEntry[] }) {
  const rows = entries.filter((e) => e.latencyStats)
  if (rows.length === 0) return null

  const phases = ["ingest", "indexing", "search", "evaluate", "total"] as const

  const bestByPhase = phases.reduce(
    (acc, phase) => {
      // LatencyByPhase has named keys but no index signature, so dynamic access requires `as any`
      const values = rows.map((e) => (e.latencyStats as any)?.[phase]?.median)
      const valid = values.filter((v: any) => v != null) as number[]
      const best = valid.length > 0 ? Math.min(...valid) : Infinity
      acc[phase] = { value: best, firstIndex: values.findIndex((v: any) => v === best) }
      return acc
    },
    {} as Record<string, { value: number; firstIndex: number }>
  )

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-text-primary font-display mb-3">
        Latency (median ms)
      </h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">
                Provider
              </th>
              {phases.map((phase) => (
                <th
                  key={phase}
                  className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs capitalize"
                >
                  {phase === "indexing" ? "Index" : phase}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, rowIdx) => (
              <tr key={entry.id} className="border-b border-border">
                <td className="py-2 px-3 text-text-primary capitalize">{entry.provider}</td>
                {phases.map((phase) => {
                  // LatencyByPhase has named keys but no index signature, so dynamic access requires `as any`
                  const value = (entry.latencyStats as any)?.[phase]?.median
                  const isBest = rowIdx === bestByPhase[phase].firstIndex
                  return (
                    <td key={phase} className="py-2 px-3 text-right font-mono">
                      {value != null ? (
                        <span
                          className={isBest ? "text-white font-semibold" : "text-text-secondary"}
                        >
                          {value.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AccuracyByTypeSection({ entries }: { entries: LeaderboardEntry[] }) {
  const allTypes = useMemo(() => {
    const types = new Set<string>()
    entries.forEach((e) => Object.keys(e.byQuestionType).forEach((t) => types.add(t)))
    return Array.from(types).sort()
  }, [entries])

  if (allTypes.length === 0) return null

  const chartData = allTypes.map((type) => ({
    type,
    values: entries.map((e) => ({
      provider: e.provider,
      accuracy: e.byQuestionType[type]?.accuracy,
    })),
  }))

  const providers = entries.map((e) => e.provider)

  const overallValues = entries.map((e) => e.accuracy)
  const overallBest = Math.max(...overallValues)
  const overallFirstBestIdx = overallValues.findIndex((a) => a === overallBest)

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-text-primary font-display mb-3">
        Accuracy by Question Type
      </h3>
      <div className="flex gap-8 items-stretch" style={{ minHeight: 420 }}>
        {/* Table */}
        <div className="w-[50%] flex flex-col">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 text-text-muted font-medium text-xs">
                    Categories
                  </th>
                  {entries.map((e) => (
                    <th
                      key={e.id}
                      className="text-right py-4 px-4 text-text-muted font-medium text-xs capitalize"
                    >
                      {e.provider}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTypes.map((type) => {
                  const values = entries.map((e) => e.byQuestionType[type]?.accuracy)
                  const valid = values.filter((a) => a != null) as number[]
                  const best = valid.length > 0 ? Math.max(...valid) : undefined
                  const firstBestIdx = best != null ? values.findIndex((a) => a === best) : -1

                  return (
                    <tr key={type} className="border-b border-border">
                      <td className="py-4 px-4 text-text-secondary">
                        {type.replace(/[-_]/g, " ")}
                      </td>
                      {values.map((accuracy, idx) => (
                        <td key={idx} className="py-4 px-4 text-right font-mono">
                          {accuracy != null ? (
                            <span
                              className={
                                idx === firstBestIdx
                                  ? "text-white font-semibold"
                                  : "text-text-secondary"
                              }
                            >
                              {(accuracy * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}

                {/* Overall row */}
                <tr className="border-t-2 border-border">
                  <td className="py-4 px-4 text-text-primary font-semibold">Overall</td>
                  {overallValues.map((accuracy, idx) => (
                    <td key={idx} className="py-4 px-4 text-right font-mono">
                      <span
                        className={
                          idx === overallFirstBestIdx
                            ? "text-white font-semibold"
                            : "text-text-secondary"
                        }
                      >
                        {(accuracy * 100).toFixed(1)}%
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="w-[50%] flex flex-col">
          <AccuracyBarChart data={chartData} providers={providers} />
        </div>
      </div>
    </div>
  )
}
