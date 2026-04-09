-- Add stable Nebula user-id mapping to profiles.
--
-- Existing deployments should backfill legacy rows with
-- scripts/backfill-nebula-profile-ids.ts before relying on nebula_user_id-only
-- profile resolution.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS nebula_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_nebula_user_id
ON public.profiles (nebula_user_id)
WHERE nebula_user_id IS NOT NULL;
