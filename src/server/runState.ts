// Shared run state for tracking active runs and stop signals
// Used by both server routes and orchestrator phases
//
// Hybrid approach: in-memory Map for hot-path sync reads (shouldStop),
// DB write-through for crash recovery persistence.

export type RunState = {
  status: "running" | "stopping"
  startedAt: string
  benchmark?: string
  userId?: string | null
}

// In-memory map of active runs
export const activeRuns = new Map<string, RunState>()

// Check if a run should stop (sync — reads Map only)
export function shouldStop(runId: string): boolean {
  const state = activeRuns.get(runId)
  return state?.status === "stopping"
}

// Mark a run as stopping (write-through)
export function requestStop(runId: string): boolean {
  const state = activeRuns.get(runId)
  if (!state) return false
  state.status = "stopping"

  // Write-through to DB (fire-and-forget)
  const { supabase } = require("./db/supabase")
  supabase.from("runs").update({ active_status: "stopping" }).eq("id", runId).then()

  return true
}

// Start tracking a run (write-through)
export function startRun(runId: string, benchmark?: string, userId?: string | null): void {
  activeRuns.set(runId, {
    status: "running",
    startedAt: new Date().toISOString(),
    benchmark,
    userId,
  })

  // Write-through to DB (fire-and-forget)
  const { supabase } = require("./db/supabase")
  supabase.from("runs").update({ active_status: "running" }).eq("id", runId).then()
}

// Stop tracking a run (write-through)
export function endRun(runId: string): void {
  activeRuns.delete(runId)

  // Write-through to DB (fire-and-forget)
  const { supabase } = require("./db/supabase")
  supabase.from("runs").update({ active_status: null }).eq("id", runId).then()
}

// Check if a run is active
export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId)
}

// Get run state
export function getRunState(runId: string): RunState | undefined {
  return activeRuns.get(runId)
}

// Get all active runs with their benchmarks
export function getActiveRunsWithBenchmarks(): Array<{ runId: string; benchmark: string }> {
  const result: Array<{ runId: string; benchmark: string }> = []
  for (const [runId, state] of activeRuns) {
    if (state.benchmark) {
      result.push({ runId, benchmark: state.benchmark })
    }
  }
  return result
}

/**
 * Crash recovery: On server startup, reset any stale active_status in DB.
 * Runs that were "running" or "stopping" when the server crashed are now dead.
 */
export async function recoverStaledRuns(): Promise<void> {
  const { supabase } = require("./db/supabase")

  // Recover runs that were actively running/stopping when the server crashed
  const { data, error } = await supabase
    .from("runs")
    .update({ active_status: null, status: "failed" })
    .not("active_status", "is", null)
    .select("id")

  if (error) {
    console.warn(`[runState] Failed to recover stale runs: ${error.message}`)
  } else if (data && data.length > 0) {
    console.log(
      `[runState] Recovered ${data.length} stale run(s): ${data.map((r: any) => r.id).join(", ")}`
    )
  }

  // Recover runs stuck in "initializing" that never started (active_status is null)
  // These are runs where the server died between DB insert and startRun()
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes
  const { data: staleInit, error: staleErr } = await supabase
    .from("runs")
    .update({ status: "failed" })
    .eq("status", "initializing")
    .is("active_status", null)
    .lt("created_at", staleThreshold)
    .select("id")

  if (staleErr) {
    console.warn(`[runState] Failed to recover stale initializing runs: ${staleErr.message}`)
  } else if (staleInit && staleInit.length > 0) {
    console.log(
      `[runState] Recovered ${staleInit.length} stale initializing run(s): ${staleInit.map((r: any) => r.id).join(", ")}`
    )
  }
}
