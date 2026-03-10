/**
 * Shared indexing coordinator.
 *
 * Instead of each question running its own polling loop, questions register
 * their pending IDs with the coordinator. A single polling loop checks all
 * pending IDs in controlled batches, reducing API overhead and eliminating
 * the need for per-question concurrency limits on the indexing phase.
 */

import type { Provider } from "../types/provider"
import type { RunCheckpoint } from "../types/checkpoint"
import type { ICheckpointManager } from "./checkpoint"
import { logger } from "../utils/logger"

interface QuestionRegistration {
  questionId: string
  ids: string[]
  resolve: (result: { questionId: string; durationMs: number }) => void
  reject: (error: Error) => void
  completedIds: string[]
  failedIds: string[]
  total: number
  startTime: number
  pollAttempts: number
}

const INITIAL_POLL_INTERVAL_MS = 2000
const MAX_POLL_INTERVAL_MS = 10000
const BATCH_SIZE = 100 // Max IDs per checkIndexingStatus call
const MAX_POLL_ATTEMPTS = 120
const MAX_WALL_CLOCK_MS = 10 * 60 * 1000 // 10 minute hard timeout per question

export class IndexingCoordinator {
  private provider: Provider
  private checkpointManager: ICheckpointManager
  private checkpoint: RunCheckpoint

  private registrations = new Map<string, QuestionRegistration>()
  private idToQuestion = new Map<string, string>()
  private pendingIds = new Set<string>()

  private pollLoopRunning = false
  private pollInterval = INITIAL_POLL_INTERVAL_MS

  constructor(
    provider: Provider,
    checkpointManager: ICheckpointManager,
    checkpoint: RunCheckpoint
  ) {
    this.provider = provider
    this.checkpointManager = checkpointManager
    this.checkpoint = checkpoint
  }

  /**
   * Register a question for indexing and wait until all its IDs are done.
   * Returns null if the question should be skipped (already completed, ingest not done, etc).
   */
  async awaitQuestion(
    questionId: string
  ): Promise<{ questionId: string; durationMs: number } | null> {
    const question = this.checkpoint.questions[questionId]
    if (!question) return null
    if (question.phases.ingest.status !== "completed") return null
    if (question.phases.indexing.status === "completed") return null

    const ingestResult = question.phases.ingest.ingestResult
    const ids = [
      ...(ingestResult?.documentIds || []),
      ...(ingestResult?.taskIds || []),
    ]

    if (ids.length === 0) {
      this.checkpointManager.updatePhase(this.checkpoint, questionId, "indexing", {
        status: "completed",
        completedIds: [],
        failedIds: [],
        completedAt: new Date().toISOString(),
        durationMs: 0,
      })
      return { questionId, durationMs: 0 }
    }

    const startTime = Date.now()
    this.checkpointManager.updatePhase(this.checkpoint, questionId, "indexing", {
      status: "in_progress",
      completedIds: [],
      failedIds: [],
      startedAt: new Date().toISOString(),
    })

    return new Promise<{ questionId: string; durationMs: number }>((resolve, reject) => {
      const registration: QuestionRegistration = {
        questionId,
        ids,
        resolve,
        reject,
        completedIds: [],
        failedIds: [],
        total: ids.length,
        startTime,
        pollAttempts: 0,
      }

      this.registrations.set(questionId, registration)
      for (const id of ids) {
        this.idToQuestion.set(id, questionId)
        this.pendingIds.add(id)
      }

      // Reset backoff when new IDs arrive — they might be ready immediately
      this.pollInterval = INITIAL_POLL_INTERVAL_MS
      this.startPolling()
    })
  }

  private startPolling(): void {
    if (this.pollLoopRunning) return
    this.pollLoopRunning = true
    this.pollLoop().catch((error) => {
      for (const reg of this.registrations.values()) {
        reg.reject(error instanceof Error ? error : new Error(String(error)))
      }
      this.registrations.clear()
      this.pendingIds.clear()
      this.idToQuestion.clear()
      this.pollLoopRunning = false
    })
  }

  private async pollLoop(): Promise<void> {
    while (this.pendingIds.size > 0) {
      const ids = Array.from(this.pendingIds)

      // Check IDs in controlled batches
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE)

        try {
          const results = await this.provider.checkIndexingStatus!(batch)

          for (const { id, status } of results) {
            const questionId = this.idToQuestion.get(id)
            if (!questionId) continue
            const reg = this.registrations.get(questionId)
            if (!reg) continue

            if (status === "completed") {
              this.pendingIds.delete(id)
              this.idToQuestion.delete(id)
              reg.completedIds.push(id)
            } else if (status === "failed") {
              this.pendingIds.delete(id)
              this.idToQuestion.delete(id)
              reg.failedIds.push(id)
            }
          }
        } catch (e) {
          // Batch check failed — leave IDs as pending, retry next cycle
          logger.debug(`Batch indexing status check failed: ${e}`)
        }
      }

      // Update checkpoint progress, resolve completed questions, and timeout expired ones
      for (const [questionId, reg] of this.registrations) {
        const done = reg.completedIds.length + reg.failedIds.length
        reg.pollAttempts++

        if (done >= reg.total) {
          const durationMs = Date.now() - reg.startTime
          this.checkpointManager.updatePhase(this.checkpoint, questionId, "indexing", {
            status: "completed",
            completedIds: reg.completedIds,
            failedIds: reg.failedIds,
            completedAt: new Date().toISOString(),
            durationMs,
          })
          reg.resolve({ questionId, durationMs })
          this.registrations.delete(questionId)
        } else if (reg.pollAttempts >= MAX_POLL_ATTEMPTS || (Date.now() - reg.startTime) >= MAX_WALL_CLOCK_MS) {
          // Per-question timeout — mark remaining IDs as failed
          for (const id of reg.ids) {
            if (this.pendingIds.has(id)) {
              reg.failedIds.push(id)
              this.pendingIds.delete(id)
              this.idToQuestion.delete(id)
            }
          }
          const durationMs = Date.now() - reg.startTime
          const reason = (Date.now() - reg.startTime) >= MAX_WALL_CLOCK_MS
            ? `wall-clock timeout (${Math.round(durationMs / 1000)}s)`
            : `poll attempts exhausted (${reg.pollAttempts})`
          logger.warn(
            `Indexing timed out for ${questionId} (${reason}): ${reg.failedIds.length}/${reg.total} failed`
          )
          this.checkpointManager.updatePhase(this.checkpoint, questionId, "indexing", {
            status: "completed",
            completedIds: reg.completedIds,
            failedIds: reg.failedIds,
            completedAt: new Date().toISOString(),
            durationMs,
          })
          reg.resolve({ questionId, durationMs })
          this.registrations.delete(questionId)
        } else {
          this.checkpointManager.updatePhase(this.checkpoint, questionId, "indexing", {
            status: "in_progress",
            completedIds: reg.completedIds,
            failedIds: reg.failedIds,
          })
        }
      }

      if (this.pendingIds.size > 0) {
        await new Promise((r) => setTimeout(r, this.pollInterval))
        this.pollInterval = Math.min(this.pollInterval * 1.3, MAX_POLL_INTERVAL_MS)
      }
    }

    this.pollLoopRunning = false
  }
}
