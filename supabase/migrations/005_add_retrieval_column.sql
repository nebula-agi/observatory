-- Add retrieval aggregates (including memory precision) to leaderboard entries
ALTER TABLE public.leaderboard_entries ADD COLUMN IF NOT EXISTS retrieval JSONB;
