import { useState, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { Highlight, themes } from "prism-react-renderer"
import { getLeaderboardEntry, type LeaderboardEntry } from "@/lib/api"
import { cn } from "@/lib/utils"
import { RadarChart } from "@/components/radar-chart"
import { LatencyTable, EvaluationList, type EvaluationResult } from "@/components/benchmark-results"

export default function LeaderboardEntryPage() {
  const params = useParams()
  const id = parseInt(params.id as string)

  const [entry, setEntry] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEntry()
  }, [id])

  async function loadEntry() {
    try {
      setLoading(true)
      const data = await getLeaderboardEntry(id)
      setEntry(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entry")
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

  if (error || !entry) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error">{error || "Entry not found"}</p>
        <Link to="/leaderboard" className="btn btn-secondary mt-4">
          Back to Leaderboard
        </Link>
      </div>
    )
  }

  let codeFiles: Record<string, string> = {}
  try {
    codeFiles = JSON.parse(entry.providerCode)
  } catch {
    codeFiles = { "index.ts": entry.providerCode }
  }

  const codeFileNames = Object.keys(codeFiles)
  const evaluations: EvaluationResult[] = entry.evaluations || []
  const accuracy = entry.accuracy * 100

  const addedDate = new Date(entry.addedAt)
  const formattedDate = `${addedDate.getFullYear()}-${String(addedDate.getMonth() + 1).padStart(2, "0")}-${String(addedDate.getDate()).padStart(2, "0")}`

  const hasLatency = !!entry.latencyStats

  return (
    <div className="stagger-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
        <Link to="/leaderboard" className="hover:text-text-primary">
          Leaderboard
        </Link>
        <span>/</span>
        <span className="text-text-primary">{entry.version}</span>
      </div>

      {/* Hero Section */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-medium text-text-primary flex items-center gap-3">
              <span className="capitalize">{entry.provider}</span>
              <span className="text-text-muted font-normal">/</span>
              <span className="text-lg text-text-secondary">{entry.version}</span>
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
              <span>
                <span className="text-text-muted">Benchmark:</span>{" "}
                <span className="capitalize">{entry.benchmark}</span>
              </span>
              <span>
                <span className="text-text-muted">Judge:</span> {entry.judgeModel}
              </span>
              <span>
                <span className="text-text-muted">Run:</span> {entry.runId}
              </span>
              <span>
                <span className="text-text-muted">Added:</span> {formattedDate}
              </span>
              {entry.submittedBy && (
                <span>
                  <span className="text-text-muted">Submitted by:</span>{" "}
                  {entry.submittedBy.displayName}
                </span>
              )}
            </div>
            {entry.notes && (
              <div className="mt-3 text-sm text-text-secondary bg-bg-elevated/60 p-3 rounded-lg border border-border">
                <span className="text-text-muted">Notes:</span> {entry.notes}
              </div>
            )}
          </div>

          {/* Large accuracy display */}
          <div className="text-right flex-shrink-0 ml-8">
            <div className="text-5xl font-display font-medium text-text-primary tabular-nums">
              {accuracy.toFixed(1)}%
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {entry.correctCount}/{entry.totalQuestions} correct
            </div>
          </div>
        </div>

        {/* Thin accuracy progress bar */}
        <div className="mt-5 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${accuracy}%` }}
          />
        </div>
      </div>

      {/* Radar Chart + Latency side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RadarChart data={entry.byQuestionType} />
        {hasLatency && <LatencyTable latency={entry.latencyStats} />}
      </div>

      {/* Results Section */}
      {evaluations.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-display font-medium text-text-primary mb-4">
            Results
            <span className="text-text-muted text-sm font-normal ml-2">
              {evaluations.length} evaluations
            </span>
          </h2>
          <EvaluationList evaluations={evaluations} />
        </div>
      )}

      {/* Code Section */}
      {codeFileNames.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-display font-medium text-text-primary mb-4">
            Provider Code
          </h2>
          <CodeSection codeFiles={codeFiles} codeFileNames={codeFileNames} />
        </div>
      )}
    </div>
  )
}

function CodeSection({
  codeFiles,
  codeFileNames,
}: {
  codeFiles: Record<string, string>
  codeFileNames: string[]
}) {
  const [activeFile, setActiveFile] = useState(codeFileNames[0])
  const code = codeFiles[activeFile] || "// No code available"

  return (
    <div>
      {codeFileNames.length > 1 && (
        <div className="flex gap-0 mb-4">
          {codeFileNames.map((fileName, index) => {
            const isSelected = activeFile === fileName
            const isFirst = index === 0
            const isLast = index === codeFileNames.length - 1
            return (
              <button
                key={fileName}
                type="button"
                onClick={() => setActiveFile(fileName)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium font-mono transition-colors border-t border-b border-r",
                  isFirst && "border-l rounded-l-lg",
                  isLast && "rounded-r-lg"
                )}
                style={{
                  backgroundColor: isSelected ? "#0a0a14" : "transparent",
                  borderColor: isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
                  color: isSelected ? "#ffffff" : "#8888a0",
                }}
              >
                {fileName}
              </button>
            )
          })}
        </div>
      )}

      <div className="bg-bg-void rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated/60 border-b border-border">
          <span className="text-sm font-mono text-text-muted">{activeFile}</span>
          <button
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            copy
          </button>
        </div>
        <Highlight theme={themes.oneDark} code={code} language="typescript">
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className="p-4 overflow-x-auto text-sm max-h-[600px] overflow-y-auto"
              style={{ ...style, background: "transparent", margin: 0 }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className="inline-block w-8 text-text-muted select-none text-right mr-4 text-xs">
                    {i + 1}
                  </span>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
