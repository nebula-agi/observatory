-- Lock down decrypted_secrets and schema_migrations so they no longer
-- appear as "unrestricted" in the Supabase dashboard.
-- All server access uses the service-role key which bypasses RLS,
-- so no application queries are affected.

-- decrypted_secrets is a view; enable RLS on its underlying query by
-- converting it to a security-barrier view and revoking public access.
ALTER VIEW public.decrypted_secrets SET (security_barrier = true);
REVOKE ALL ON public.decrypted_secrets FROM anon, authenticated;

-- schema_migrations is a plain table with no RLS.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
-- No permissive policies → only service-role (which bypasses RLS) can access.
