-- Remove public-schema Vault wrappers.
-- Server code now accesses vault.* directly via Postgres, so the public
-- view and SECURITY DEFINER functions are no longer needed. Dropping them
-- eliminates the "unrestricted" dashboard badge and reduces the exposed
-- API surface through PostgREST.

DROP FUNCTION IF EXISTS public.create_secret(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.delete_secret(UUID);
DROP VIEW IF EXISTS public.decrypted_secrets;

-- The grants/revokes from migration 010 are now moot since the objects
-- no longer exist. The schema_migrations RLS from 010 is still in effect.
