export interface QuestionTypeInfo {
  id: string
  alias: string
  description: string
}

export type QuestionTypeRegistry = Record<string, QuestionTypeInfo>

export interface UnifiedMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: string
  speaker?: string
}

export interface UnifiedSession {
  sessionId: string
  messages: UnifiedMessage[]
  metadata?: Record<string, unknown>
}

export interface UnifiedQuestion {
  questionId: string
  question: string
  questionType: string
  groundTruth: string
  haystackSessionIds: string[]
  metadata?: Record<string, unknown>
}

export type SearchResult = unknown

export interface RetrievalMetrics {
  memoryPrecision: number
  relevantChars: number
  totalChars: number
}

export interface RetrievalAggregates {
  memoryPrecision: number
  totalChars: number
}

export interface EvaluationResult {
  questionId: string
  questionType: string
  question: string
  score: number
  label: "correct" | "incorrect"
  explanation: string
  groundTruth: string
  searchResults: SearchResult[]
  searchDurationMs: number
  totalDurationMs: number
  retrievalMetrics?: RetrievalMetrics
}

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

export interface QuestionTypeStats {
  total: number
  correct: number
  accuracy: number
  latency: {
    search: LatencyStats
    total: LatencyStats
  }
  retrieval?: RetrievalAggregates
}

export interface BenchmarkResult {
  provider: string
  benchmark: string
  runId: string
  dataSourceRunId: string
  judge: string
  timestamp: string
  summary: {
    totalQuestions: number
    correctCount: number
    accuracy: number
  }
  latency: {
    ingest: LatencyStats
    indexing: LatencyStats
    search: LatencyStats
    evaluate: LatencyStats
    total: LatencyStats
  }
  retrieval?: RetrievalAggregates
  byQuestionType: Record<string, QuestionTypeStats>
  questionTypeRegistry?: QuestionTypeRegistry
  evaluations: EvaluationResult[]
}
