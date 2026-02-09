-- Allow multiple leaderboard entries per provider+benchmark (auto-populated from runs)
ALTER TABLE public.leaderboard_entries DROP CONSTRAINT IF EXISTS leaderboard_entries_user_id_provider_benchmark_version_key;

-- Default version to empty string (will be set to runId by auto-populate)
ALTER TABLE public.leaderboard_entries ALTER COLUMN version SET DEFAULT '';

-- One leaderboard entry per run (idempotency for --force re-runs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_run_id ON public.leaderboard_entries(run_id) WHERE run_id IS NOT NULL;
