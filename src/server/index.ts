import { handleRunsRoutes } from "./routes/runs"
import { handleBenchmarksRoutes } from "./routes/benchmarks"
import { handleLeaderboardRoutes } from "./routes/leaderboard"
import { handleCompareRoutes } from "./routes/compare"
import { handleAuthRoutes } from "./routes/auth"
import { WebSocketManager } from "./websocket"
import { recoverStaledRuns, activeRuns, requestStop, startRun, endRun, setCompletion } from "./runState"
import { orchestrator } from "../orchestrator"
import { fetchAllUserKeys } from "./services/apiKeys"
import { getProviderConfig, getJudgeConfig } from "../utils/config"
import type { ProviderName } from "../types/provider"
import type { BenchmarkName } from "../types/benchmark"
import { runMigrations } from "./db/migrate"
import { logger } from "../utils/logger"
import { join } from "path"
import { Subprocess } from "bun"

export interface ServerOptions {
  port: number
  open?: boolean
}

const isProduction = process.env.NODE_ENV === "production"
let uiProcess: Subprocess | null = null

const ALLOWED_ORIGINS = (process.env.OBSERVATORY_ALLOWED_ORIGINS || "http://localhost:3003")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Baggage, Sentry-Trace",
    "Access-Control-Max-Age": "86400",
  }

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Credentials"] = "true"
    headers["Vary"] = "Origin"
  }

  return headers
}

export const wsManager = new WebSocketManager()

/**
 * Auto-resume runs that were gracefully interrupted by a previous shutdown.
 * Loads checkpoint data to reconstruct run parameters and restarts them.
 */
async function resumeInterruptedRuns(): Promise<void> {
  const { supabase } = require("./db/supabase")

  const { data: interrupted, error } = await supabase
    .from("runs")
    .select("id, provider, benchmark, judge, user_id, sampling, concurrency")
    .eq("status", "interrupted")

  if (error) {
    logger.warn(`Failed to query interrupted runs: ${error.message}`)
    return
  }

  if (!interrupted || interrupted.length === 0) return

  logger.info(`Auto-resuming ${interrupted.length} interrupted run(s)...`)

  const checkpointManager = orchestrator.getCheckpointManager()

  for (const run of interrupted) {
    try {
      const userKeys = run.user_id ? await fetchAllUserKeys(run.user_id) : undefined

      startRun(run.id, run.benchmark, run.user_id)

      const completion = orchestrator.run({
        provider: run.provider as ProviderName,
        benchmark: run.benchmark as BenchmarkName,
        runId: run.id,
        judgeModel: run.judge,
        userId: run.user_id,
        userKeys,
        sampling: run.sampling,
        concurrency: run.concurrency,
      }).then(async () => {
        const finalCheckpoint = await checkpointManager.load(run.id)
        wsManager.broadcast({ type: "run_finished", runId: run.id, status: finalCheckpoint?.status || "completed" })
      }).catch(async (err: Error) => {
        logger.error(`Resumed run ${run.id} failed: ${err.message}`)
        const checkpoint = await checkpointManager.load(run.id)
        if (checkpoint) {
          checkpointManager.updateStatus(checkpoint, "failed")
        }
        wsManager.broadcast({ type: "error", runId: run.id, message: err.message })
      }).finally(() => {
        endRun(run.id)
      })
      setCompletion(run.id, completion)

      logger.info(`Resumed run ${run.id} (${run.provider}/${run.benchmark})`)
    } catch (e) {
      logger.error(`Failed to resume run ${run.id}: ${e}`)
      // Mark as failed so it doesn't retry on next startup
      await supabase.from("runs").update({ status: "failed" }).eq("id", run.id)
    }
  }
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { port, open = true } = options

  // Auto-run migrations. Failures are non-fatal only because the direct Postgres
  // connection may be unreachable even when Supabase (used by all routes) is fine.
  // If the schema is actually missing, routes will 500 on their own.
  try {
    await runMigrations()
  } catch (e) {
    logger.error(`Migration failed, continuing startup: ${e instanceof Error ? e.message : e}`)
  }

  // Crash recovery: reset stale active_status in DB for runs that were running when server died
  await recoverStaledRuns()

  // Auto-resume runs that were gracefully interrupted by a previous shutdown
  await resumeInterruptedRuns()

  const server = Bun.serve({
    port,

    async fetch(req, server) {
      const url = new URL(req.url)

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: getCorsHeaders(req), status: 204 })
      }

      // Liveness probe: process is alive and can serve HTTP
      if (url.pathname === "/api/live") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // Readiness probe: dependencies are reachable
      if (url.pathname === "/api/ready") {
        try {
          const { supabase } = await import("./db/supabase")
          const { data, error } = await supabase
            .from("runs")
            .select("id")
            .limit(1)
            .abortSignal(AbortSignal.timeout(2000))
          if (error) throw error
          return new Response(JSON.stringify({ status: "ok" }), {
            headers: { "Content-Type": "application/json" },
          })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return new Response(JSON.stringify({ status: "not_ready", error: message }), {
            status: 503,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          })
        }
      }

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req)
        if (upgraded) return undefined
        return new Response("WebSocket upgrade failed", { status: 400 })
      }

      // API routes
      try {
        let response: Response | null = null

        if (url.pathname.startsWith("/api/runs")) {
          response = await handleRunsRoutes(req, url)
        } else if (url.pathname.startsWith("/api/compare")) {
          response = await handleCompareRoutes(req, url)
        } else if (
          url.pathname.startsWith("/api/benchmarks") ||
          url.pathname.startsWith("/api/providers") ||
          url.pathname === "/api/models" ||
          url.pathname === "/api/downloads"
        ) {
          response = await handleBenchmarksRoutes(req, url)
        } else if (url.pathname.startsWith("/api/leaderboard")) {
          response = await handleLeaderboardRoutes(req, url)
        } else if (url.pathname.startsWith("/api/auth")) {
          response = await handleAuthRoutes(req, url)
        }

        if (response) {
          // Add CORS headers to response
          const headers = new Headers(response.headers)
          Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
            headers.set(key, value)
          })
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        }

        // In production, serve static UI files from ui/dist
        if (isProduction) {
          const uiDist = join(import.meta.dir, "../../ui/dist")
          const filePath = url.pathname === "/" ? "/index.html" : url.pathname
          const file = Bun.file(join(uiDist, filePath))
          if (await file.exists()) {
            return new Response(file)
          }
          // SPA fallback: serve index.html for client-side routes
          const indexFile = Bun.file(join(uiDist, "index.html"))
          if (await indexFile.exists()) {
            return new Response(indexFile)
          }
        }

        // 404 for unknown routes
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error"
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        })
      }
    },

    websocket: {
      open(ws) {
        wsManager.addClient(ws)
      },
      message(ws, message) {
        wsManager.handleMessage(ws, message)
      },
      close(ws) {
        wsManager.removeClient(ws)
      },
    },
  })

  logger.success(`Observatory API server running at http://localhost:${port}`)
  logger.info(`WebSocket available at ws://localhost:${port}/ws`)

  if (isProduction) {
    logger.info("Production mode: serving static UI from ui/dist")
  } else {
    // Start UI dev server in development
    const uiDir = join(process.cwd(), "ui")
    const uiPort = 3003

    uiProcess = Bun.spawn(["bun", "run", "dev"], {
      cwd: uiDir,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        VITE_API_URL: `http://localhost:${port}`,
      },
    })

    logger.success(`UI dev server starting at http://localhost:${uiPort}`)

    if (open) {
      const openCommand =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open"
      Bun.spawn([openCommand, `http://localhost:${uiPort}`])
    }
  }

  // Handle graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 30_000
  let shuttingDown = false

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true

    const runIds = [...activeRuns.keys()]
    if (runIds.length > 0) {
      logger.info(`Graceful shutdown: stopping ${runIds.length} active run(s)...`)
      for (const runId of runIds) {
        requestStop(runId)
      }

      // Wait for runs to finish and checkpoint, with a hard timeout
      const waitForDrain = new Promise<void>((resolve) => {
        const check = () => {
          if (activeRuns.size === 0) return resolve()
          setTimeout(check, 200)
        }
        check()
      })

      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (activeRuns.size > 0) {
            logger.warn(`Shutdown timeout: ${activeRuns.size} run(s) still active, forcing exit.`)
          }
          resolve()
        }, SHUTDOWN_TIMEOUT_MS)
      })

      await Promise.race([waitForDrain, timeout])

      // Flush any remaining checkpoint writes
      await orchestrator.getCheckpointManager().flush()

      // Only mark runs that are still active (didn't finish during drain) as interrupted
      const stillActive = runIds.filter((id) => activeRuns.has(id))
      if (stillActive.length > 0) {
        const { supabase } = require("./db/supabase")
        const { error: updateError } = await supabase
          .from("runs")
          .update({ status: "interrupted", active_status: null })
          .in("id", stillActive)
          .neq("status", "completed")
        if (updateError) {
          logger.error(`Failed to mark runs as interrupted: ${updateError.message}`)
        } else {
          logger.info(`${stillActive.length} run(s) marked as interrupted for auto-resume.`)
        }
      }
    }

    if (uiProcess) {
      logger.info("Shutting down UI server...")
      uiProcess.kill()
      uiProcess = null
    }

    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
