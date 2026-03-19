-- Lock down decrypted_secrets, vault wrapper functions, and schema_migrations
-- so they no longer appear as "unrestricted" in the Supabase dashboard.

-- 1. decrypted_secrets view: revoke access from all non-service roles.
--    The REVOKE is what actually prevents access; security_barrier is dropped
--    since it only matters for row-filtering views, not access control.
REVOKE ALL ON public.decrypted_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.decrypted_secrets TO service_role;

-- 2. Vault wrapper functions: PostgreSQL grants EXECUTE to PUBLIC by default,
--    so anon/authenticated can call these via Supabase RPC unless revoked.
REVOKE EXECUTE ON FUNCTION public.create_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_secret(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_secret(UUID) TO service_role;

-- 3. schema_migrations: enable RLS with no permissive policies.
--    The migration runner connects as a privileged DB role (via direct Postgres
--    connection, not the Supabase client), which bypasses RLS as table owner.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
