-- Finalize Nebula-auth profile invariants after the identity cutover.
--
-- Every loginable Observatory profile is now anchored on nebula_user_id and
-- stores a normalized lowercase email copy for display and sync purposes.

UPDATE public.profiles
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE nebula_user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'profiles.nebula_user_id must be backfilled before applying 014_finalize_nebula_profiles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE email IS NULL OR email <> lower(trim(email))
  ) THEN
    RAISE EXCEPTION
      'profiles.email must be present and normalized before applying 014_finalize_nebula_profiles';
  END IF;
END $$;

ALTER TABLE public.profiles
ALTER COLUMN nebula_user_id SET NOT NULL;

ALTER TABLE public.profiles
ALTER COLUMN email SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_email_normalized'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_email_normalized
    CHECK (email = lower(trim(email)));
  END IF;
END $$;
