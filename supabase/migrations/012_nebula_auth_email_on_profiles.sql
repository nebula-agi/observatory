-- Add email column to profiles for Nebula JWT email-based lookup.
-- Existing Supabase-provisioned rows will have NULL email initially;
-- the auth middleware auto-provisions new rows with email set.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email) WHERE email IS NOT NULL;

-- Drop the FK to auth.users so Nebula-provisioned profiles (with
-- server-generated UUIDs) don't require a Supabase auth row.
-- Existing rows keep their UUIDs; new rows get gen_random_uuid().
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
