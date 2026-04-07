-- Add email column to profiles for Nebula JWT email-based lookup.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email) WHERE email IS NOT NULL;

-- Backfill email from auth.users for existing profiles.
-- This maps Supabase-provisioned profiles to their email so
-- Nebula JWT lookup finds them instead of creating duplicates.
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id
  AND p.email IS NULL
  AND au.email IS NOT NULL;

-- Drop the FK to auth.users so Nebula-provisioned profiles (with
-- server-generated UUIDs) don't require a Supabase auth row.
-- Existing rows keep their UUIDs; new rows get gen_random_uuid().
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
