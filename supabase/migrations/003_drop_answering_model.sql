-- Remove answering_model from all tables (answer phase removed from pipeline)
ALTER TABLE public.runs DROP COLUMN IF EXISTS answering_model;
ALTER TABLE public.leaderboard_entries DROP COLUMN IF EXISTS answering_model;
ALTER TABLE public.comparisons DROP COLUMN IF EXISTS answering_model;

-- answered_count is always 0 now, drop it too
ALTER TABLE public.runs DROP COLUMN IF EXISTS answered_count;
