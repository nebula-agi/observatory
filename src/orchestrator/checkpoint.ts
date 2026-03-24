import type {
  RunCheckpoint,
  QuestionCheckpoint,
  PhaseStatus,
  PhaseId,
  RunStatus,
  SamplingConfig,
} from "../types/checkpoint"
import type { ConcurrencyConfig } from "../types/concurrency"
import type { Provider } from "../types/provider"

/**
 * ICheckpointManager — the shared interface used by orchestrator phases and server routes.
 * All I/O methods are async. Pure in-memory reads (getPhaseStatus, getSummary) take a
 * RunCheckpoint arg so they can stay synchronous (no DB round-trip needed).
 */
export interface ICheckpointManager {
  exists(runId: string): Promise<boolean>
  load(runId: string): Promise<RunCheckpoint | null>
  save(checkpoint: RunCheckpoint, questionIds?: string[]): void // fire-and-forget, queues internally
  flush(runId?: string): Promise<void>
  create(
    runId: string,
    provider: string,
    benchmark: string,
    judge: string,
    options?: {
      userId?: string | null
      limit?: number
      sampling?: SamplingConfig
      targetQuestionIds?: string[]
      dataSourceRunId?: string
      status?: RunStatus
      concurrency?: ConcurrencyConfig
      searchEffort?: "auto" | "low" | "medium" | "high"
    }
  ): Promise<RunCheckpoint>
  delete(runId: string): Promise<void>
  deleteWithCleanup(runId: string, provider: Provider): Promise<void>
  updateStatus(checkpoint: RunCheckpoint, status: RunStatus): void // mutates in-memory + queues save
  listRuns(): Promise<string[]>
  initQuestion(
    checkpoint: RunCheckpoint,
    questionId: string,
    containerTag: string,
    metadata: {
      question: string
      groundTruth: string
      questionType: string
      questionDate?: string
    }
  ): void // mutates in-memory checkpoint
  updatePhase<P extends keyof QuestionCheckpoint["phases"]>(
    checkpoint: RunCheckpoint,
    questionId: string,
    phase: P,
    updates: Partial<QuestionCheckpoint["phases"][P]>
  ): void
  updateSessions(
    checkpoint: RunCheckpoint,
    questionId: string,
    sessions: Array<{ sessionId: string; date?: string; messageCount: number }>
  ): void
  getPhaseStatus(
    checkpoint: RunCheckpoint,
    questionId: string,
    phase: keyof QuestionCheckpoint["phases"]
  ): PhaseStatus
  getSummary(checkpoint: RunCheckpoint): {
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
  copyCheckpoint(
    sourceRunId: string,
    newRunId: string,
    fromPhase: PhaseId,
    overrides?: { judge?: string; userId?: string | null }
  ): Promise<RunCheckpoint>
}
