import type { ICheckpointManager } from "../../orchestrator/checkpoint"
import { SupabaseCheckpointManager } from "../../orchestrator/supabaseCheckpoint"
import { orchestrator } from "../../orchestrator"
import { wsManager } from "../index"
import { activeRuns, startRun, startRunIfIdle, endRun, requestStop, isRunActive, getRunState, acquireRetrySlot, releaseRetrySlot, setCompletion, waitForCompletionWithTimeout } from "../runState"
import { createBenchmark } from "../../benchmarks"
import { createProvider } from "../../providers"
import { getProviderConfig, getJudgeConfig } from "../../utils/config"
import { resolveModel } from "../../utils/models"
import { optionalAuth, AuthError } from "../middleware/auth"
import { fetchAllUserKeys } from "../services/apiKeys"
import type { ProviderName } from "../../types/provider"
import type { BenchmarkName } from "../../types/benchmark"
import type { PhaseId, SamplingConfig } from "../../types/checkpoint"
import type { ConcurrencyConfig } from "../../types/concurrency"
import { getPhasesFromPhase, PHASE_ORDER } from "../../types/checkpoint"
import { autoAddToLeaderboard } from "./leaderboard"
import { generateReport, saveReport } from "../../orchestrator/phases/report"

function getCheckpointManager(): ICheckpointManager {
  const { supabase } = require("../db/supabase")
  return new SupabaseCheckpointManager(supabase)
}

const checkpointManager = getCheckpointManager()

const benchmarkRegistryCache: Record<string, any> = {}

function getQuestionTypeRegistry(benchmarkName: string) {
  if (!benchmarkRegistryCache[benchmarkName]) {
    try {
      const benchmark = createBenchmark(benchmarkName as BenchmarkName)
      benchmarkRegistryCache[benchmarkName] = benchmark.getQuestionTypes()
    } catch {
      // Unknown benchmark (e.g. removed benchmark with historical data) — return empty registry
      benchmarkRegistryCache[benchmarkName] = {}
    }
  }
  return benchmarkRegistryCache[benchmarkName]
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function verifyRunOwnership(runId: string, user: import("../middleware/auth").AuthUser | null): Promise<Response | null> {
  if (!user) {
    return json({ error: "Authentication required" }, 401)
  }
  const { supabase } = require("../db/supabase")
  const { data: run, error } = await supabase
    .from("runs")
    .select("user_id")
    .eq("id", runId)
    .single()
  if (error || !run) {
    if (error && error.code !== "PGRST116") {
      return json({ error: "Failed to verify run ownership" }, 500)
    }
    return json({ error: "Run not found" }, 404)
  }
  if (run.user_id !== user.id) {
    return json({ error: "Forbidden" }, 403)
  }
  return null
}

/**
 * Verify a run is visible to the caller.
 * Completed runs are public; non-completed runs require ownership.
 */
async function verifyRunVisibility(runId: string, user: import("../middleware/auth").AuthUser | null): Promise<Response | null> {
  const { supabase } = require("../db/supabase")
  const { data: run, error } = await supabase
    .from("runs")
    .select("status, user_id")
    .eq("id", runId)
    .single()
  if (error || !run) {
    if (error && error.code !== "PGRST116") {
      return json({ error: "Failed to verify run visibility" }, 500)
    }
    return json({ error: "Run not found" }, 404)
  }
  if (isPublicRunStatus(run.status)) return null
  // Non-completed runs require ownership
  if (!user || run.user_id !== user.id) {
    return json({ error: "Run not found" }, 404)
  }
  return null
}

export async function handleRunsRoutes(req: Request, url: URL): Promise<Response | null> {
  const method = req.method
  const pathname = url.pathname

  // GET /api/runs - List runs
  // ?view=mine  → personal runs (all statuses, requires auth)
  // default     → public log (completed runs only)
  if (method === "GET" && pathname === "/api/runs") {
    const user = await optionalAuth(req)
    const view = url.searchParams.get("view")

    const { supabase } = require("../db/supabase")
    let query = supabase.from("runs").select("*").order("created_at", { ascending: false })

    if (view === "mine") {
      if (!user) return json({ error: "Authentication required" }, 401)
      query = query.eq("user_id", user.id)
    } else {
      query = query.eq("status", "completed")
    }

    const { data: runs, error } = await query

    if (error) return json({ error: error.message }, 500)

    const runDetails = (runs || []).map((run: any) => {
      const summary = {
        total: run.total_questions,
        ingested: run.ingested_count,
        indexed: run.indexed_count,
        searched: run.searched_count,
        evaluated: run.evaluated_count,
      }

      return {
        runId: run.id,
        provider: run.provider,
        benchmark: run.benchmark,
        judge: run.judge,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        status: getRunStatusFromDb(run, summary),
        summary,
        accuracy: run.accuracy,
      }
    })

    return json(runDetails)
  }

  // GET /api/runs/:runId - Get checkpoint
  const runIdMatch = pathname.match(/^\/api\/runs\/([^/]+)$/)
  if (method === "GET" && runIdMatch) {
    const runId = decodeURIComponent(runIdMatch[1])

    // Handle initializing runs before DB visibility check (row may not exist yet)
    if (isRunActive(runId)) {
      const state = getRunState(runId)
      const user = await optionalAuth(req)
      // Only the owner can see an initializing run
      if (state?.userId && (!user || state.userId !== user.id)) {
        return json({ error: "Run not found" }, 404)
      }

      const checkpoint = await checkpointManager.load(runId)
      if (!checkpoint) {
        return json({
          runId,
          status: "initializing",
          benchmark: state?.benchmark,
          createdAt: state?.startedAt,
        })
      }
      const summary = checkpointManager.getSummary(checkpoint)
      const { userId: _uid, ...rest } = checkpoint
      return json({
        ...rest,
        status: getRunStatus(checkpoint, summary),
        summary,
      })
    }

    const user = await optionalAuth(req)
    const visError = await verifyRunVisibility(runId, user)
    if (visError) return visError

    const checkpoint = await checkpointManager.load(runId)
    if (!checkpoint) {
      return json({ error: "Run not found" }, 404)
    }
    const summary = checkpointManager.getSummary(checkpoint)
    const { userId: _uid, ...rest } = checkpoint
    return json({
      ...rest,
      status: getRunStatus(checkpoint, summary),
      summary,
    })
  }

  // GET /api/runs/:runId/report - Get report
  const reportMatch = pathname.match(/^\/api\/runs\/([^/]+)\/report$/)
  if (method === "GET" && reportMatch) {
    const runId = decodeURIComponent(reportMatch[1])
    const user = await optionalAuth(req)
    const visError = await verifyRunVisibility(runId, user)
    if (visError) return visError

    const { supabase } = require("../db/supabase")
    const { data, error } = await supabase
      .from("reports")
      .select("report_data")
      .eq("run_id", runId)
      .single()

    if (error || !data) {
      return json({ error: "Report not found" }, 404)
    }
    return json(data.report_data)
  }

  // GET /api/runs/:runId/questions - List questions
  const questionsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/questions$/)
  if (method === "GET" && questionsMatch) {
    const runId = decodeURIComponent(questionsMatch[1])
    const user = await optionalAuth(req)
    const visError = await verifyRunVisibility(runId, user)
    if (visError) return visError
    const checkpoint = await checkpointManager.load(runId)
    if (!checkpoint) {
      return json({ error: "Run not found" }, 404)
    }

    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const status = url.searchParams.get("status")
    const type = url.searchParams.get("type")

    let questions = Object.values(checkpoint.questions)

    if (status) {
      questions = questions.filter((q) => {
        const evalStatus = q.phases.evaluate.status
        if (status === "completed") return evalStatus === "completed"
        if (status === "failed") return evalStatus === "failed"
        if (status === "pending") return evalStatus !== "completed" && evalStatus !== "failed"
        return true
      })
    }

    if (type) {
      questions = questions.filter((q) => q.questionType === type)
    }

    const total = questions.length
    const start = (page - 1) * limit
    const paged = questions.slice(start, start + limit)

    return json({
      questions: paged,
      questionTypeRegistry: getQuestionTypeRegistry(checkpoint.benchmark),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  }

  // GET /api/runs/:runId/questions/:questionId - Get question detail
  const questionDetailMatch = pathname.match(/^\/api\/runs\/([^/]+)\/questions\/([^/]+)$/)
  if (method === "GET" && questionDetailMatch) {
    const runId = decodeURIComponent(questionDetailMatch[1])
    const user = await optionalAuth(req)
    const visError = await verifyRunVisibility(runId, user)
    if (visError) return visError
    const questionId = decodeURIComponent(questionDetailMatch[2])
    const checkpoint = await checkpointManager.load(runId)
    if (!checkpoint) {
      return json({ error: "Run not found" }, 404)
    }
    const question = checkpoint.questions[questionId]
    if (!question) {
      return json({ error: "Question not found" }, 404)
    }

    const { supabase } = require("../db/supabase")
    const { data } = await supabase
      .from("search_results")
      .select("*")
      .eq("run_id", runId)
      .eq("question_id", questionId)
      .single()
    const searchResults = data
      ? {
          questionId: data.question_id,
          results: data.results,
          ...data.metadata,
        }
      : null

    return json({
      ...question,
      searchResultsFile: searchResults,
    })
  }

  // POST /api/runs/preflight - Validate required keys exist before starting a run
  if (method === "POST" && pathname === "/api/runs/preflight") {
    try {
      const user = await optionalAuth(req)
      const body = await req.json()
      const { provider, judgeModel } = body

      if (!provider || !judgeModel) {
        return json({ error: "Missing required fields: provider, judgeModel" }, 400)
      }

      const judgeModelInfo = resolveModel(judgeModel)
      const judgeName = judgeModelInfo.provider

      const userKeys = user ? await fetchAllUserKeys(user.id) : undefined
      const missing: string[] = []

      // Check provider key
      try {
        const providerConfig = getProviderConfig(provider, userKeys)
        if (!providerConfig.apiKey) missing.push(provider)
      } catch {
        missing.push(provider)
      }

      // Check judge key
      try {
        const judgeConfig = getJudgeConfig(judgeName, userKeys)
        if (!judgeConfig.apiKey) missing.push(judgeName)
      } catch {
        missing.push(judgeName)
      }

      const required = [...new Set([provider, judgeName])]
      return json({ valid: missing.length === 0, missing, required })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Preflight check failed" }, 400)
    }
  }

  // POST /api/runs/start - Start new run (requires auth)
  if (method === "POST" && pathname === "/api/runs/start") {
    try {
      const user = await optionalAuth(req)
      if (!user) {
        return json({ error: "Authentication required to start a run" }, 401)
      }

      // Rate limit: 10 runs per user per day
      const { supabase } = require("../db/supabase")
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const { count, error: countError } = await supabase
        .from("runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", todayStart.toISOString())
      if (countError) {
        return json({ error: "Failed to check rate limit" }, 500)
      }
      if ((count ?? 0) >= 10) {
        return json({ error: "Daily run limit reached (10 per day). Try again tomorrow." }, 429)
      }

      const userKeys = await fetchAllUserKeys(user.id)
      const body = await req.json()
      console.log("[API] Start run request body:", JSON.stringify(body, null, 2))
      const {
        provider,
        benchmark,
        runId,
        judgeModel,
        limit,
        sampling,
        concurrency,
        searchEffort,
        force,
        fromPhase,
        sourceRunId,
      } = body
      console.log("[API] Extracted sampling:", sampling)
      console.log("[API] Extracted concurrency:", concurrency)

      if (!provider || !benchmark || !runId || !judgeModel) {
        return json(
          {
            error: "Missing required fields: provider, benchmark, runId, judgeModel",
          },
          400
        )
      }

      const VALID_EFFORTS = ["auto", "low", "medium", "high"]
      if (searchEffort !== undefined) {
        if (!VALID_EFFORTS.includes(searchEffort)) {
          return json(
            { error: `Invalid searchEffort: ${searchEffort}. Valid values: ${VALID_EFFORTS.join(", ")}` },
            400
          )
        }
        if (provider !== "nebula") {
          return json(
            { error: "searchEffort is only supported for the nebula provider" },
            400
          )
        }
      }

      if (fromPhase && !PHASE_ORDER.includes(fromPhase)) {
        return json(
          {
            error: `Invalid phase: ${fromPhase}. Valid phases: ${PHASE_ORDER.join(", ")}`,
          },
          400
        )
      }

      if (sourceRunId && fromPhase === "ingest") {
        return json(
          {
            error:
              "Cannot start from ingest phase in advanced mode. Use indexing, search, evaluate, or report.",
          },
          400
        )
      }

      if (activeRuns.has(runId)) {
        return json({ error: "Run is already active" }, 409)
      }

      if (sourceRunId) {
        const ownerError = await verifyRunOwnership(sourceRunId, user)
        if (ownerError) return ownerError

        const sourceCheckpoint = await checkpointManager.load(sourceRunId)
        if (!sourceCheckpoint) {
          return json({ error: `Source run not found: ${sourceRunId}` }, 404)
        }

        if (sourceCheckpoint.provider !== provider) {
          return json(
            {
              error: `Provider mismatch: source run has ${sourceCheckpoint.provider}, not ${provider}`,
            },
            400
          )
        }
        if (sourceCheckpoint.benchmark !== benchmark) {
          return json(
            {
              error: `Benchmark mismatch: source run has ${sourceCheckpoint.benchmark}, not ${benchmark}`,
            },
            400
          )
        }

        if (await checkpointManager.exists(runId)) {
          return json({ error: `Run ${runId} already exists` }, 409)
        }

        const forkedCheckpoint = await checkpointManager.copyCheckpoint(sourceRunId, runId, fromPhase as PhaseId, {
          judge: judgeModel,
          userId: user.id,
        })
        if (searchEffort !== undefined) {
          forkedCheckpoint.searchEffort = searchEffort
          checkpointManager.save(forkedCheckpoint)
        }
        await checkpointManager.flush(runId)
      }

      startRun(runId, benchmark, user.id)

      const completion = runBenchmark({
        provider: provider as ProviderName,
        benchmark: benchmark as BenchmarkName,
        runId,
        judgeModel,
        userId: user.id,
        userKeys,
        limit,
        sampling,
        concurrency,
        searchEffort,
        force: sourceRunId ? false : force,
        fromPhase: fromPhase as PhaseId | undefined,
      }).finally(() => {
        endRun(runId)
      })
      setCompletion(runId, completion)

      return json({ message: "Run started", runId })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Invalid request body" }, 400)
    }
  }

  // POST /api/runs/:runId/questions/retry - Retry specific questions
  const retryMatch = pathname.match(/^\/api\/runs\/([^/]+)\/questions\/retry$/)
  if (method === "POST" && retryMatch) {
    const runId = decodeURIComponent(retryMatch[1])
    const user = await optionalAuth(req)
    const ownerError = await verifyRunOwnership(runId, user)
    if (ownerError) return ownerError

    // Parse and validate the request body before acquiring the slot so we
    // can bail early without affecting run state, and so we have checkpoint
    // data (benchmark name) available for the slot.
    let body: any
    try {
      body = await req.json()
    } catch {
      return json({ error: "Invalid request body" }, 400)
    }
    const { questionIds, fromPhase } = body as { questionIds?: string[]; fromPhase?: string }
    if (!questionIds || questionIds.length === 0) {
      return json({ error: "questionIds is required and must be non-empty" }, 400)
    }

    const validPhases = ["ingest", "indexing", "search", "evaluate"] as const
    if (fromPhase && !validPhases.includes(fromPhase as any)) {
      return json({ error: `Invalid fromPhase: "${fromPhase}". Must be one of: ${validPhases.join(", ")}` }, 400)
    }
    const startPhase = (fromPhase as typeof validPhases[number]) || "ingest"
    const phaseIndex = validPhases.indexOf(startPhase)
    const phasesToReset = validPhases.slice(phaseIndex)

    const checkpoint = await checkpointManager.load(runId)
    if (!checkpoint) {
      return json({ error: "Run not found" }, 404)
    }

    // Validate all questionIds exist in the checkpoint
    const missing = questionIds.filter((qId) => !checkpoint.questions[qId])
    if (missing.length > 0) {
      return json({ error: `Questions not found: ${missing.join(", ")}` }, 400)
    }

    // Acquire a retry slot — allows concurrent retries on the same run,
    // but blocks if a full (non-retry) run is active.
    // Returns the slot number (1 = first) so we can gate run_started atomically.
    const retrySlot = acquireRetrySlot(runId, checkpoint.benchmark, user?.id)
    if (!retrySlot) {
      return json({ error: "Cannot retry questions while a full run is active" }, 409)
    }

    // Broadcast run_started immediately for the first slot — before any async
    // work that could fail — so WebSocket clients always get a matching pair.
    if (retrySlot === 1) {
      wsManager.broadcast({
        type: "run_started",
        runId,
        provider: checkpoint.provider,
        benchmark: checkpoint.benchmark,
      })
    }

    // Helper: release slot, persist failed status, broadcast, and call endRun if last.
    const releaseSlot = async () => {
      const isLast = releaseRetrySlot(runId)
      if (isLast) {
        try {
          checkpointManager.updateStatus(checkpoint, "failed")
          await checkpointManager.flush(runId)
        } catch (e) {
          console.error(`[retry] Failed to persist failed status for run ${runId}:`, e)
        }
        wsManager.broadcast({
          type: "run_finished",
          runId,
          status: "failed",
        })
        endRun(runId)
      }
    }

    try {

      const { supabase } = require("../db/supabase")
      const userKeys = user ? await fetchAllUserKeys(user.id) : undefined

      // Only clear provider-side data when retrying from ingest (full retry).
      // Re-ingesting into dirty state produces polluted results.
      if (startPhase === "ingest") {
        let provider: ReturnType<typeof createProvider>
        try {
          provider = createProvider(checkpoint.provider as ProviderName)
          await provider.initialize(getProviderConfig(checkpoint.provider, userKeys))
        } catch (e) {
          await releaseSlot()
          return json({ error: `Failed to initialize provider for cleanup: ${e}` }, 500)
        }

        const clearFailures: string[] = []
        for (const qId of questionIds) {
          const containerTag = checkpoint.questions[qId].containerTag
          try {
            await provider.clear(containerTag)
          } catch (e) {
            clearFailures.push(`${containerTag}: ${e}`)
          }
        }
        if (clearFailures.length > 0) {
          await releaseSlot()
          return json({
            error: `Failed to clear provider data for ${clearFailures.length} question(s). Retry aborted to avoid duplicate data.\n${clearFailures.join("\n")}`,
          }, 500)
        }
      }

      // Reset only the phases from startPhase onward
      for (const qId of questionIds) {
        const q = checkpoint.questions[qId]
        for (const phase of phasesToReset) {
          if (phase === "ingest") {
            q.phases.ingest = { status: "pending", completedSessions: [] }
          } else if (phase === "indexing") {
            q.phases.indexing = { status: "pending" }
          } else if (phase === "search") {
            q.phases.search = { status: "pending" }
          } else if (phase === "evaluate") {
            q.phases.evaluate = { status: "pending" }
          }
        }
      }

      // Delete search results if retrying from search or earlier
      if (phaseIndex <= validPhases.indexOf("search")) {
        await supabase
          .from("search_results")
          .delete()
          .eq("run_id", runId)
          .in("question_id", questionIds)
      }

      await supabase
        .from("reports")
        .delete()
        .eq("run_id", runId)

      // Save only the retried questions — passing questionIds avoids
      // overwriting other questions with stale data from this snapshot.
      checkpointManager.save(checkpoint, questionIds)
      await checkpointManager.flush(runId)

      // Start the run targeting only retried questions (slot already acquired above).
      // Lifecycle events and report generation are handled in the finalizer below
      // rather than inside runBenchmark, to avoid premature/stale results from
      // concurrent retries.
      const retryCompletion = runBenchmark({
        provider: checkpoint.provider as ProviderName,
        benchmark: checkpoint.benchmark as BenchmarkName,
        runId,
        judgeModel: checkpoint.judge,
        userId: user!.id,
        userKeys,
        concurrency: checkpoint.concurrency,
        questionIds,
        fromPhase: startPhase as PhaseId,
        skipLifecycleEvents: true,
        skipReport: true,
      }).finally(async () => {
        try {
          const isLast = releaseRetrySlot(runId)
          if (isLast) {
            // Reload checkpoint from DB to get fresh question states from all
            // concurrent retries, then recompute the run status and report.
            // The run stays in activeRuns throughout finalization so DELETEs
            // and new starts are blocked until we're done.
            try {
              const finalCheckpoint = await checkpointManager.load(runId)
              let finalStatus: "completed" | "failed" | "interrupted" = "failed"
              if (finalCheckpoint) {
                const questions = Object.values(finalCheckpoint.questions)
                const allDone = questions.every(
                  (q) => q.phases.evaluate.status === "completed"
                )
                const anyFailed = questions.some(
                  (q) => Object.values(q.phases).some((p) => p.status === "failed")
                )
                const recomputedStatus = allDone ? "completed" : anyFailed ? "failed" : "interrupted"
                // Preserve "failed" if the error handler already set it (e.g. retry
                // died during provider/judge init before any phase marked a question
                // as failed). Don't downgrade to "interrupted".
                finalStatus = finalCheckpoint.status === "failed" && recomputedStatus === "interrupted"
                  ? "failed"
                  : recomputedStatus
                checkpointManager.updateStatus(finalCheckpoint, finalStatus)
                await checkpointManager.flush(runId)

                // Regenerate the report from the fresh checkpoint so it reflects
                // all concurrent retries' results, not just one stale snapshot.
                try {
                  const bench = createBenchmark(finalCheckpoint.benchmark as BenchmarkName)
                  await bench.load()
                  const report = generateReport(bench, finalCheckpoint)
                  await saveReport(report)
                } catch (e) {
                  console.error(`[retry] Failed to regenerate report:`, e)
                }
              }

              if (finalStatus === "completed") {
                try {
                  await autoAddToLeaderboard(runId, user!.id)
                } catch (e) {
                  console.error(`[retry] Failed to auto-add to leaderboard:`, e)
                }
              }
              wsManager.broadcast({
                type: "run_finished",
                runId,
                status: finalStatus,
              })
            } finally {
              // Only mark the run as idle after all finalization is done
              endRun(runId)
            }
          }
        } catch (e) {
          console.error(`[retry] Unexpected error in retry finalizer for run ${runId}:`, e)
          if (isRunActive(runId)) {
            endRun(runId)
          }
        }
      })
      setCompletion(runId, retryCompletion)

      return json({ message: "Retry started", runId, questionIds })
    } catch (e) {
      await releaseSlot()
      return json({ error: e instanceof Error ? e.message : "Retry failed" }, 500)
    }
  }

  // POST /api/runs/:runId/stop - Stop running benchmark
  const stopMatch = pathname.match(/^\/api\/runs\/([^/]+)\/stop$/)
  if (method === "POST" && stopMatch) {
    const runId = decodeURIComponent(stopMatch[1])
    if (!isRunActive(runId)) {
      return json({ error: "Run is not active" }, 404)
    }

    const user = await optionalAuth(req)
    if (!user) {
      return json({ error: "Authentication required" }, 401)
    }

    // For initializing runs the DB row may not exist yet — check in-memory state
    const runState = getRunState(runId)
    if (runState?.userId && runState.userId !== user.id) {
      return json({ error: "Forbidden" }, 403)
    }
    // If DB row exists, verify ownership there too
    if (!runState?.userId) {
      const ownerError = await verifyRunOwnership(runId, user)
      if (ownerError) return ownerError
    }

    requestStop(runId)
    return json({ message: "Stop requested", runId })
  }

  // DELETE /api/runs/:runId - Delete run
  const deleteMatch = pathname.match(/^\/api\/runs\/([^/]+)$/)
  if (method === "DELETE" && deleteMatch) {
    const runId = decodeURIComponent(deleteMatch[1])
    const user = await optionalAuth(req)
    const ownerError = await verifyRunOwnership(runId, user)
    if (ownerError) return ownerError

    // If run is active, stop it and wait for the background process to
    // fully wind down before deleting any data.
    if (isRunActive(runId)) {
      requestStop(runId)
      const DELETE_TIMEOUT_MS = 30_000
      const settled = await waitForCompletionWithTimeout(runId, DELETE_TIMEOUT_MS)
      if (!settled) {
        return json({ error: "Run is still shutting down, please retry shortly" }, 503)
      }
    }

    const cleanup = url.searchParams.get("cleanup") === "true"

    if (cleanup) {
      try {
        const checkpoint = await checkpointManager.load(runId)
        if (checkpoint) {
          const ownerId = checkpoint.userId
          const userKeys = ownerId ? await fetchAllUserKeys(ownerId) : undefined
          const provider = createProvider(checkpoint.provider as ProviderName)
          await provider.initialize(getProviderConfig(checkpoint.provider, userKeys))
          await checkpointManager.deleteWithCleanup(runId, provider)
        } else {
          await checkpointManager.delete(runId)
        }
      } catch (e) {
        return json({ error: `Failed to delete with cleanup: ${e}` }, 500)
      }
    } else {
      await checkpointManager.delete(runId)
    }

    return json({ message: "Run deleted", runId })
  }

  return null
}

function isPublicRunStatus(status: string): boolean {
  return status === "completed"
}

function getRunStatusFromDb(run: any, summary: any): string {
  // Active process takes priority
  const runState = getRunState(run.id)
  if (runState) return runState.status

  if (run.status === "completed") return "completed"
  if (run.status === "failed") return "failed"
  if (run.status === "interrupted") return "partial"

  if (summary.evaluated === summary.total && summary.total > 0) return "completed"

  if (run.status === "running" || run.status === "initializing") {
    if (summary.ingested > 0 || run.status === "running") return "partial"
    return "pending"
  }

  if (summary.ingested === 0) return "pending"
  return "partial"
}

function getRunStatus(checkpoint: any, summary: any): string {
  const runState = getRunState(checkpoint.runId)
  if (runState) {
    return runState.status
  }

  if (checkpoint.status === "completed") {
    return "completed"
  }
  if (checkpoint.status === "failed") {
    return "failed"
  }

  const questions = Object.values(checkpoint.questions || {}) as any[]
  const hasFailed = questions.some((q: any) => {
    const phases = q.phases || {}
    return (
      phases.ingest?.status === "failed" ||
      phases.indexing?.status === "failed" ||
      phases.search?.status === "failed" ||
      phases.evaluate?.status === "failed"
    )
  })

  if (hasFailed) {
    return "failed"
  }

  if (summary.evaluated === summary.total && summary.total > 0) {
    return "completed"
  }

  if (checkpoint.status === "running" || checkpoint.status === "initializing") {
    if (summary.ingested > 0 || checkpoint.status === "running") {
      return "partial"
    }
    return "pending"
  }

  if (summary.ingested === 0) {
    return "pending"
  }
  return "partial"
}

async function runBenchmark(options: {
  provider: ProviderName
  benchmark: BenchmarkName
  runId: string
  judgeModel: string
  userId?: string | null
  userKeys?: Record<string, string>
  limit?: number
  sampling?: SamplingConfig
  concurrency?: ConcurrencyConfig
  searchEffort?: "auto" | "low" | "medium" | "high"
  force?: boolean
  fromPhase?: PhaseId
  questionIds?: string[]
  skipLifecycleEvents?: boolean
  skipReport?: boolean
}) {
  try {
    if (!options.skipLifecycleEvents) {
      wsManager.broadcast({
        type: "run_started",
        runId: options.runId,
        provider: options.provider,
        benchmark: options.benchmark,
      })
    }

    let phases = options.fromPhase ? getPhasesFromPhase(options.fromPhase) : undefined
    if (options.skipReport) {
      phases = (phases || PHASE_ORDER).filter((p) => p !== "report")
    }

    await orchestrator.run({
      provider: options.provider,
      benchmark: options.benchmark,
      runId: options.runId,
      judgeModel: options.judgeModel,
      userId: options.userId,
      userKeys: options.userKeys,
      limit: options.limit,
      sampling: options.sampling,
      concurrency: options.concurrency,
      searchEffort: options.searchEffort,
      force: options.force,
      phases,
      questionIds: options.questionIds,
    })

    if (!options.skipLifecycleEvents) {
      // Read the final checkpoint status set by the orchestrator
      const finalCheckpoint = await checkpointManager.load(options.runId)
      const finalStatus = finalCheckpoint?.status || "completed"

      // Only add to leaderboard if the run fully completed
      if (finalStatus === "completed") {
        try {
          await autoAddToLeaderboard(options.runId, options.userId)
        } catch (e) {
          console.error(`[runBenchmark] Failed to auto-add to leaderboard:`, e)
        }
      }

      wsManager.broadcast({
        type: "run_finished",
        runId: options.runId,
        status: finalStatus,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`[runBenchmark] Run ${options.runId} failed:`, message)

    // Persist the failure state directly in the DB — avoid updateStatus/save
    // which would write ALL questions and could overwrite concurrent retries'
    // progress with stale data from this snapshot.
    const { supabase: sb } = require("../db/supabase")
    await sb.from("runs").update({ status: "failed" }).eq("id", options.runId)

    if (!options.skipLifecycleEvents) {
      const wasStoppedByUser = message.includes("stopped by user")
      wsManager.broadcast({
        type: wasStoppedByUser ? "run_stopped" : "error",
        runId: options.runId,
        message,
      })
    }
  }
}
