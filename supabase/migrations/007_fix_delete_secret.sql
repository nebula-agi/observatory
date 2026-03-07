-- Fix delete_secret wrapper: vault.delete_secret() doesn't exist,
-- so delete directly from vault.secrets table instead.

CREATE OR REPLACE FUNCTION public.delete_secret(
  secret_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
  RETURN secret_id;
END;
$$;
