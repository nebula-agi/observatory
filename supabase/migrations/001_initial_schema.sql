-- Observatory Supabase Schema (idempotent — safe to re-run)

-- AUTH
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys — encrypted via Supabase Vault
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL CHECK (key_name IN ('supermemory', 'mem0', 'zep', 'nebula', 'openai', 'anthropic', 'google')),
  encrypted_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key_name)
);

-- RUNS
CREATE TABLE IF NOT EXISTS public.runs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  data_source_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'initializing' CHECK (status IN ('initializing', 'running', 'completed', 'failed')),
  active_status TEXT CHECK (active_status IN ('running', 'stopping')),
  provider TEXT NOT NULL,
  benchmark TEXT NOT NULL,
  judge TEXT NOT NULL,
  answering_model TEXT NOT NULL,
  "limit" INTEGER,
  sampling JSONB,
  target_question_ids JSONB,
  concurrency JSONB,
  total_questions INTEGER NOT NULL DEFAULT 0,
  ingested_count INTEGER NOT NULL DEFAULT 0,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  searched_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  evaluated_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON public.runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON public.runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_active ON public.runs(active_status) WHERE active_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runs_created ON public.runs(created_at DESC);

-- QUESTIONS
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  container_tag TEXT NOT NULL,
  question TEXT NOT NULL,
  ground_truth TEXT NOT NULL,
  question_type TEXT NOT NULL,
  question_date TEXT,
  sessions JSONB,
  phase_ingest JSONB NOT NULL DEFAULT '{"status":"pending","completedSessions":[]}',
  phase_indexing JSONB NOT NULL DEFAULT '{"status":"pending"}',
  phase_search JSONB NOT NULL DEFAULT '{"status":"pending"}',
  phase_answer JSONB NOT NULL DEFAULT '{"status":"pending"}',
  phase_evaluate JSONB NOT NULL DEFAULT '{"status":"pending"}',
  UNIQUE(run_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_questions_run ON public.questions(run_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(question_type);

-- SEARCH RESULTS
CREATE TABLE IF NOT EXISTS public.search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]',
  metadata JSONB,
  UNIQUE(run_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_search_results_run ON public.search_results(run_id);

-- REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE REFERENCES public.runs(id) ON DELETE CASCADE,
  report_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LEADERBOARD
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES public.runs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  benchmark TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'baseline',
  accuracy REAL NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  by_question_type JSONB NOT NULL,
  latency_stats JSONB,
  evaluations JSONB,
  provider_code TEXT NOT NULL,
  prompts_used JSONB,
  judge_model TEXT NOT NULL,
  answering_model TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(user_id, provider, benchmark, version)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_accuracy ON public.leaderboard_entries(accuracy DESC);

-- COMPARISONS
CREATE TABLE IF NOT EXISTS public.comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  benchmark TEXT NOT NULL,
  judge TEXT NOT NULL,
  answering_model TEXT NOT NULL,
  sampling JSONB,
  target_question_ids JSONB NOT NULL DEFAULT '[]',
  runs JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (defense-in-depth, server uses service-role which bypasses these)
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent via DO blocks)
DO $$ BEGIN
  -- Public read on everything except API keys
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'runs' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.runs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.questions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'search_results' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.search_results FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.reports FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_entries' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.leaderboard_entries FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comparisons' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.comparisons FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'public_read') THEN
    CREATE POLICY "public_read" ON public.profiles FOR SELECT USING (true);
  END IF;

  -- Write own data only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'runs' AND policyname = 'owner_write') THEN
    CREATE POLICY "owner_write" ON public.runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_entries' AND policyname = 'owner_write') THEN
    CREATE POLICY "owner_write" ON public.leaderboard_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comparisons' AND policyname = 'owner_write') THEN
    CREATE POLICY "owner_write" ON public.comparisons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- API keys: owner only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_api_keys' AND policyname = 'owner_only') THEN
    CREATE POLICY "owner_only" ON public.user_api_keys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'owner_only') THEN
    CREATE POLICY "owner_only" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;
