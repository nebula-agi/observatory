import { handleRunsRoutes } from "./routes/runs"
import { handleBenchmarksRoutes } from "./routes/benchmarks"
import { handleLeaderboardRoutes } from "./routes/leaderboard"
import { handleCompareRoutes } from "./routes/compare"
import { handleAuthRoutes } from "./routes/auth"
import { WebSocketManager } from "./websocket"
import { recoverStaledRuns, activeRuns, requestStop } from "./runState"
import { orchestrator } from "../orchestrator"
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Baggage, Sentry-Trace",
  "Access-Control-Max-Age": "86400",
}

export const wsManager = new WebSocketManager()

export async function startServer(options: ServerOptions): Promise<void> {
  const { port, open = true } = options

  // Auto-run database migrations if needed
  await runMigrations()

  // Crash recovery: reset stale active_status in DB for runs that were running when server died
  await recoverStaledRuns()

  const server = Bun.serve({
    port,

    async fetch(req, server) {
      const url = new URL(req.url)

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS_HEADERS, status: 204 })
      }

      // Health check (no CORS needed, used by K8s probes)
      if (url.pathname === "/api/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        })
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
          Object.entries(CORS_HEADERS).forEach(([key, value]) => {
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
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error"
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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
      logger.info("All checkpoints flushed.")
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
