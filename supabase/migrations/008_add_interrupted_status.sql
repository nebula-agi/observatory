-- Allow "interrupted" as a valid run status for graceful shutdown auto-resume
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE public.runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('initializing', 'running', 'completed', 'failed', 'interrupted'));
