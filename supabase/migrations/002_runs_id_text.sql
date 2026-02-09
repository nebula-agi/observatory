-- Change runs.id from UUID to TEXT to support slug-style run IDs
-- (e.g. "nebula-longmemeval-20260209-abc1")

-- Drop foreign keys first
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_run_id_fkey;
ALTER TABLE public.search_results DROP CONSTRAINT IF EXISTS search_results_run_id_fkey;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_run_id_fkey;
ALTER TABLE public.leaderboard_entries DROP CONSTRAINT IF EXISTS leaderboard_entries_run_id_fkey;

-- Change column types
ALTER TABLE public.runs ALTER COLUMN id SET DATA TYPE TEXT;
ALTER TABLE public.runs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.runs ALTER COLUMN data_source_run_id SET DATA TYPE TEXT;

ALTER TABLE public.questions ALTER COLUMN run_id SET DATA TYPE TEXT;
ALTER TABLE public.search_results ALTER COLUMN run_id SET DATA TYPE TEXT;
ALTER TABLE public.reports ALTER COLUMN run_id SET DATA TYPE TEXT;
ALTER TABLE public.leaderboard_entries ALTER COLUMN run_id SET DATA TYPE TEXT;

-- Re-add foreign keys
ALTER TABLE public.questions ADD CONSTRAINT questions_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;
ALTER TABLE public.search_results ADD CONSTRAINT search_results_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD CONSTRAINT reports_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;
ALTER TABLE public.leaderboard_entries ADD CONSTRAINT leaderboard_entries_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE SET NULL;
