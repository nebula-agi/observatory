import { existsSync } from "fs"
import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises"
import { join } from "path"
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
import { PHASE_ORDER } from "../types/checkpoint"
import type { ICheckpointManager } from "./checkpoint"
import { logger } from "../utils/logger"

export class FileCheckpointManager implements ICheckpointManager {
  private baseDir: string
  private saveLock = new Map<string, Promise<void>>()
  private cache = new Map<string, RunCheckpoint>()

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  private checkpointPath(runId: string): string {
    return join(this.baseDir, `${runId}.json`)
  }

  private async ensureBaseDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true })
  }

  async exists(runId: string): Promise<boolean> {
    return existsSync(this.checkpointPath(runId))
  }

  async load(runId: string): Promise<RunCheckpoint | null> {
    const cached = this.cache.get(runId)
    if (cached) {
      return cached
    }

    const path = this.checkpointPath(runId)
    if (!existsSync(path)) {
      return null
    }

    const checkpoint = JSON.parse(await readFile(path, "utf8")) as RunCheckpoint
    this.cache.set(runId, checkpoint)
    return checkpoint
  }

  save(checkpoint: RunCheckpoint): void {
    this.cache.set(checkpoint.runId, checkpoint)

    const currentQueue = this.saveLock.get(checkpoint.runId) || Promise.resolve()
    const nextQueue = currentQueue.then(() => this.performSave(checkpoint.runId))
    this.saveLock.set(checkpoint.runId, nextQueue)

    nextQueue.finally(() => {
      if (this.saveLock.get(checkpoint.runId) === nextQueue) {
        this.saveLock.delete(checkpoint.runId)
      }
    })
  }

  private async performSave(runId: string): Promise<void> {
    const checkpoint = this.cache.get(runId)
    if (!checkpoint) {
      return
    }

    checkpoint.updatedAt = new Date().toISOString()
    await this.ensureBaseDir()
    await writeFile(this.checkpointPath(runId), JSON.stringify(checkpoint, null, 2))
  }

  async flush(runId?: string): Promise<void> {
    if (runId) {
      await this.saveLock.get(runId)
      return
    }

    await Promise.all(Array.from(this.saveLock.values()))
  }

  async create(
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
  ): Promise<RunCheckpoint> {
    const checkpoint: RunCheckpoint = {
      runId,
      dataSourceRunId: options?.dataSourceRunId || runId,
      userId: options?.userId || null,
      status: options?.status || "initializing",
      provider,
      benchmark,
      judge,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      limit: options?.limit,
      sampling: options?.sampling,
      targetQuestionIds: options?.targetQuestionIds,
      concurrency: options?.concurrency,
      searchEffort: options?.searchEffort,
      questions: {},
    }

    this.cache.set(runId, checkpoint)
    this.save(checkpoint)
    await this.flush(runId)
    return checkpoint
  }

  async delete(runId: string): Promise<void> {
    this.cache.delete(runId)
    this.saveLock.delete(runId)
    const path = this.checkpointPath(runId)
    if (existsSync(path)) {
      await rm(path, { force: true })
    }
  }

  async deleteWithCleanup(runId: string, provider: Provider): Promise<void> {
    try {
      const checkpoint = await this.load(runId)
      if (checkpoint) {
        const containerTags = Object.values(checkpoint.questions)
          .map((q) => q.containerTag)
          .filter((tag, index, arr) => arr.indexOf(tag) === index)

        for (const containerTag of containerTags) {
          try {
            await provider.clear(containerTag)
          } catch (error) {
            logger.warn(`Failed to clear collection ${containerTag}: ${error}`)
          }
        }
      }
    } finally {
      await this.delete(runId)
    }
  }

  updateStatus(checkpoint: RunCheckpoint, status: RunStatus): void {
    checkpoint.status = status
    this.save(checkpoint)
  }

  async listRuns(): Promise<string[]> {
    await this.ensureBaseDir()
    const entries = await readdir(this.baseDir)
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.replace(/\.json$/, ""))
      .sort()
  }

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
  ): void {
    if (checkpoint.questions[questionId]) {
      return
    }

    checkpoint.questions[questionId] = {
      questionId,
      containerTag,
      question: metadata.question,
      groundTruth: metadata.groundTruth,
      questionType: metadata.questionType,
      questionDate: metadata.questionDate,
      phases: {
        ingest: { status: "pending", completedSessions: [] },
        indexing: { status: "pending" },
        search: { status: "pending" },
        evaluate: { status: "pending" },
      },
    }
  }

  updateSessions(
    checkpoint: RunCheckpoint,
    questionId: string,
    sessions: Array<{ sessionId: string; date?: string; messageCount: number }>
  ): void {
    const question = checkpoint.questions[questionId]
    if (!question) {
      return
    }

    question.sessions = sessions
    this.save(checkpoint)
  }

  updatePhase<P extends keyof QuestionCheckpoint["phases"]>(
    checkpoint: RunCheckpoint,
    questionId: string,
    phase: P,
    updates: Partial<QuestionCheckpoint["phases"][P]>
  ): void {
    const question = checkpoint.questions[questionId]
    if (!question) {
      return
    }

    Object.assign(question.phases[phase], updates)
    this.save(checkpoint)
  }

  getPhaseStatus(
    checkpoint: RunCheckpoint,
    questionId: string,
    phase: keyof QuestionCheckpoint["phases"]
  ): PhaseStatus {
    return checkpoint.questions[questionId]?.phases[phase].status || "pending"
  }

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
  } {
    const questions = Object.values(checkpoint.questions)

    let episodesTotal = 0
    let episodesCompleted = 0
    let episodesFailed = 0

    for (const question of questions) {
      const ingestResult = question.phases.ingest.ingestResult
      const total =
        (ingestResult?.documentIds?.length || 0) + (ingestResult?.taskIds?.length || 0)
      episodesTotal += total
      episodesCompleted += question.phases.indexing.completedIds?.length || 0
      episodesFailed += question.phases.indexing.failedIds?.length || 0
    }

    return {
      total: questions.length,
      ingested: questions.filter((q) => q.phases.ingest.status === "completed").length,
      indexed: questions.filter((q) => q.phases.indexing.status === "completed").length,
      searched: questions.filter((q) => q.phases.search.status === "completed").length,
      evaluated: questions.filter((q) => q.phases.evaluate.status === "completed").length,
      ...(episodesTotal > 0
        ? {
            indexingEpisodes: {
              total: episodesTotal,
              completed: episodesCompleted,
              failed: episodesFailed,
            },
          }
        : {}),
    }
  }

  async copyCheckpoint(
    sourceRunId: string,
    newRunId: string,
    fromPhase: PhaseId,
    overrides?: { judge?: string; userId?: string | null }
  ): Promise<RunCheckpoint> {
    const source = await this.load(sourceRunId)
    if (!source) {
      throw new Error(`Source checkpoint not found: ${sourceRunId}`)
    }

    const fromIndex = PHASE_ORDER.indexOf(fromPhase)
    const phasesToReset = PHASE_ORDER.slice(fromIndex)
    const questionPhaseKeys: (keyof QuestionCheckpoint["phases"])[] = [
      "ingest",
      "indexing",
      "search",
      "evaluate",
    ]

    const newQuestions: Record<string, QuestionCheckpoint> = {}
    for (const [questionId, question] of Object.entries(source.questions)) {
      const clonedQuestion = JSON.parse(JSON.stringify(question)) as QuestionCheckpoint

      for (const phaseKey of questionPhaseKeys) {
        if (!phasesToReset.includes(phaseKey as PhaseId)) {
          continue
        }

        if (phaseKey === "ingest") {
          clonedQuestion.phases.ingest = { status: "pending", completedSessions: [] }
        } else if (phaseKey === "indexing") {
          clonedQuestion.phases.indexing = { status: "pending" }
        } else if (phaseKey === "search") {
          clonedQuestion.phases.search = { status: "pending" }
        } else if (phaseKey === "evaluate") {
          clonedQuestion.phases.evaluate = { status: "pending" }
        }
      }

      newQuestions[questionId] = clonedQuestion
    }

    const checkpoint: RunCheckpoint = {
      runId: newRunId,
      dataSourceRunId: source.dataSourceRunId || sourceRunId,
      userId: overrides?.userId !== undefined ? overrides.userId : source.userId,
      status: "running",
      provider: source.provider,
      benchmark: source.benchmark,
      judge: overrides?.judge || source.judge,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      limit: source.limit,
      sampling: source.sampling,
      targetQuestionIds: source.targetQuestionIds,
      concurrency: source.concurrency,
      searchEffort: source.searchEffort,
      questions: newQuestions,
    }

    this.cache.set(newRunId, checkpoint)
    this.save(checkpoint)
    await this.flush(newRunId)
    return checkpoint
  }
}
