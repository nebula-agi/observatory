-- Public schema wrappers for Supabase Vault operations.
-- PostgREST (and thus supabase.rpc() / .from()) only exposes the `public` schema,
-- but vault functions and views live in the `vault` schema.

-- Expose decrypted_secrets view so .from("decrypted_secrets") works
CREATE OR REPLACE VIEW public.decrypted_secrets AS
  SELECT * FROM vault.decrypted_secrets;

CREATE OR REPLACE FUNCTION public.create_secret(
  new_secret TEXT,
  new_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_id UUID;
BEGIN
  SELECT vault.create_secret(new_secret, new_name) INTO secret_id;
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_secret(
  secret_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_id UUID;
BEGIN
  SELECT vault.delete_secret(secret_id) INTO deleted_id;
  RETURN deleted_id;
END;
$$;
