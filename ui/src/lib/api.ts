import { supabase } from "./supabase"

const API_BASE = import.meta.env.VITE_API_URL || ""

export interface RunSummary {
  runId: string
  provider: string
  benchmark: string
  judge: string
  createdAt: string
  updatedAt: string
  status: "initializing" | "pending" | "running" | "stopping" | "completed" | "partial" | "failed"
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
  accuracy: number | null
}

interface PhaseTimingFields {
  startedAt?: string
  completedAt?: string
  durationMs?: number
  error?: string
}

export interface QuestionCheckpoint {
  questionId: string
  containerTag: string
  question: string
  groundTruth: string
  questionType: string
  phases: {
    ingest: PhaseTimingFields & { status: string; completedSessions: string[] }
    indexing: PhaseTimingFields & { status: string; completedIds?: string[]; failedIds?: string[] }
    search: PhaseTimingFields & { status: string; results?: any[]; resultCount?: number }
    evaluate: PhaseTimingFields & { status: string; score?: number; label?: string; explanation?: string }
  }
}

export interface RunDetail extends RunSummary {
  questions: Record<string, QuestionCheckpoint>
}

export interface Provider {
  name: string
  displayName: string
  concurrency: ConcurrencyConfig | null
}

export interface Benchmark {
  name: string
  displayName: string
  description: string
}

export interface QuestionTypeInfo {
  id: string
  alias: string
  description: string
}

export type QuestionTypeRegistry = Record<string, QuestionTypeInfo>

export interface PaginatedResponse<T> {
  questions: T[]
  questionTypes?: string[]
  questionTypeRegistry?: QuestionTypeRegistry
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Fetch wrapper with error handling and optional auth
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  }

  // Attach auth token if available
  if (supabase) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`
      }
    } catch {
      // ignore auth errors — proceed without token
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }))
    throw new Error(error.error || "Request failed")
  }

  return res.json()
}

// Runs
export async function getRuns(view?: "mine"): Promise<RunSummary[]> {
  const query = view ? `?view=${view}` : ""
  return fetchApi(`/api/runs${query}`)
}

export async function getRun(runId: string): Promise<RunDetail> {
  return fetchApi(`/api/runs/${encodeURIComponent(runId)}`)
}

export async function getRunReport(runId: string): Promise<any> {
  return fetchApi(`/api/runs/${encodeURIComponent(runId)}/report`)
}

export async function getRunQuestions(
  runId: string,
  params?: { page?: number; limit?: number; status?: string; type?: string }
): Promise<PaginatedResponse<QuestionCheckpoint>> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", params.page.toString())
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.status) searchParams.set("status", params.status)
  if (params?.type) searchParams.set("type", params.type)

  const query = searchParams.toString()
  return fetchApi(`/api/runs/${encodeURIComponent(runId)}/questions${query ? `?${query}` : ""}`)
}

export async function deleteRun(runId: string, cleanup = false): Promise<void> {
  const url = cleanup ? `/api/runs/${encodeURIComponent(runId)}?cleanup=true` : `/api/runs/${encodeURIComponent(runId)}`
  await fetchApi(url, { method: "DELETE" })
}

export async function stopRun(runId: string): Promise<{ message: string }> {
  return fetchApi(`/api/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" })
}

export type PhaseId = "ingest" | "indexing" | "search" | "evaluate" | "report"

export const PHASE_ORDER: PhaseId[] = [
  "ingest",
  "indexing",
  "search",
  "evaluate",
  "report",
]

export type SelectionMode = "full" | "sample" | "limit"
export type SampleType = "consecutive" | "random"

export interface SamplingConfig {
  mode: SelectionMode
  sampleType?: SampleType
  perCategory?: number
  limit?: number
}

export interface ConcurrencyConfig {
  default?: number
  ingest?: number
  indexing?: number
  search?: number
  evaluate?: number
}

export async function startRun(params: {
  provider: string
  benchmark: string
  runId: string
  judgeModel: string
  limit?: number
  sampling?: SamplingConfig
  concurrency?: ConcurrencyConfig
  searchEffort?: "auto" | "low" | "medium" | "high"
  force?: boolean
  fromPhase?: PhaseId
  sourceRunId?: string
}): Promise<{ message: string; runId: string }> {
  return fetchApi("/api/runs/start", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export async function retryQuestions(
  runId: string,
  questionIds: string[],
  fromPhase?: string
): Promise<{ message: string; runId: string; questionIds: string[] }> {
  return fetchApi(`/api/runs/${encodeURIComponent(runId)}/questions/retry`, {
    method: "POST",
    body: JSON.stringify({ questionIds, fromPhase }),
  })
}

export async function preflightRun(params: {
  provider: string
  judgeModel: string
}): Promise<{ valid: boolean; missing: string[]; required: string[] }> {
  return fetchApi("/api/runs/preflight", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

// Providers & Benchmarks
export async function getProviders(): Promise<{ providers: Provider[] }> {
  return fetchApi("/api/providers")
}

export async function getBenchmarks(): Promise<{ benchmarks: Benchmark[] }> {
  return fetchApi("/api/benchmarks")
}

export async function getBenchmarkQuestions(
  benchmark: string,
  params?: { page?: number; limit?: number; type?: string }
): Promise<
  PaginatedResponse<{
    questionId: string
    question: string
    questionType: string
    groundTruth: string
  }>
> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", params.page.toString())
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.type) searchParams.set("type", params.type)

  const query = searchParams.toString()
  return fetchApi(`/api/benchmarks/${benchmark}/questions${query ? `?${query}` : ""}`)
}

export async function getModels(): Promise<{
  models: { openai: any[]; anthropic: any[]; google: any[] }
}> {
  return fetchApi("/api/models")
}

// Latency stats structure
export interface LatencyStats {
  min: number
  max: number
  mean: number
  median: number
  p95: number
  p99: number
  stdDev: number
  count: number
}

export interface LatencyByPhase {
  ingest: LatencyStats
  indexing: LatencyStats
  search: LatencyStats
  evaluate: LatencyStats
  total: LatencyStats
}

// Retrieval quality aggregates
export interface RetrievalAggregates {
  memoryPrecision: number
  totalChars: number
}

// Evaluation result for individual questions
export interface EvaluationResult {
  questionId: string
  questionType: string
  question?: string
  groundTruth: string
  score: number
  label: string
  explanation: string
  searchResults?: any[]
  searchDurationMs?: number
  totalDurationMs?: number
}

// Leaderboard
export interface LeaderboardEntry {
  id: number
  runId: string
  provider: string
  benchmark: string
  version: string
  accuracy: number
  totalQuestions: number
  correctCount: number
  byQuestionType: Record<string, { total: number; correct: number; accuracy: number; retrieval?: RetrievalAggregates }>
  retrieval?: RetrievalAggregates
  questionTypeRegistry: QuestionTypeRegistry | null
  latencyStats: LatencyByPhase | null
  evaluations: EvaluationResult[]
  providerCode: string
  promptsUsed: Record<string, string> | null
  judgeModel: string
  addedAt: string
  notes: string | null
  isLatest: boolean
  submittedBy: { displayName: string; avatarUrl: string | null } | null
}

export async function getLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  return fetchApi("/api/leaderboard")
}

export async function getLeaderboardEntry(id: number): Promise<LeaderboardEntry> {
  return fetchApi(`/api/leaderboard/${id}`)
}

export async function removeFromLeaderboard(id: number): Promise<void> {
  await fetchApi(`/api/leaderboard/${id}`, { method: "DELETE" })
}

// Downloads
export interface ActiveDownload {
  benchmark: string
  displayName: string
  runId: string
}

export interface DownloadsResponse {
  hasActive: boolean
  downloads: ActiveDownload[]
}

export async function getActiveDownloads(): Promise<DownloadsResponse> {
  return fetchApi("/api/downloads")
}
