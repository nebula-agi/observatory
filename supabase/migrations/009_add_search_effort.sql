-- Add search_effort column to runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS search_effort TEXT;
