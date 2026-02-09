const VALID_KEY_NAMES = [
  "supermemory",
  "mem0",
  "zep",
  "nebula",
  "openai",
  "anthropic",
  "google",
] as const

export type ApiKeyName = (typeof VALID_KEY_NAMES)[number]

export function isValidKeyName(name: string): name is ApiKeyName {
  return VALID_KEY_NAMES.includes(name as ApiKeyName)
}

function getSupabase() {
  const { supabase } = require("../db/supabase")
  return supabase
}

/**
 * Get a user's decrypted API key by name.
 * Returns the plaintext key or null if not found.
 */
export async function getUserApiKey(
  userId: string,
  keyName: ApiKeyName
): Promise<string | null> {
  const supabase = getSupabase()

  // Get the vault secret ID from user_api_keys
  const { data: keyRow, error } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("key_name", keyName)
    .single()

  if (error || !keyRow) return null

  // Decrypt via vault.decrypted_secrets view
  const { data: secret, error: secretError } = await supabase
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", keyRow.encrypted_key)
    .single()

  if (secretError || !secret) return null

  return secret.decrypted_secret
}

/**
 * Set or update a user's API key.
 * Creates a Vault secret and stores the reference.
 */
export async function setUserApiKey(
  userId: string,
  keyName: ApiKeyName,
  key: string
): Promise<void> {
  const supabase = getSupabase()

  // Check if key already exists — if so, delete old vault secret first
  const { data: existing } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("key_name", keyName)
    .single()

  if (existing?.encrypted_key) {
    // Delete old vault secret
    await supabase.rpc("delete_secret", { secret_id: existing.encrypted_key })
  }

  // Create new vault secret
  const { data: newSecret, error: vaultError } = await supabase.rpc("create_secret", {
    new_secret: key,
    new_name: `${userId}_${keyName}`,
  })

  if (vaultError) {
    throw new Error(`Failed to store key in vault: ${vaultError.message}`)
  }

  // Upsert the key reference
  const { error: upsertError } = await supabase.from("user_api_keys").upsert(
    {
      user_id: userId,
      key_name: keyName,
      encrypted_key: newSecret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key_name" }
  )

  if (upsertError) {
    throw new Error(`Failed to save key reference: ${upsertError.message}`)
  }
}

/**
 * Delete a user's API key.
 * Removes both the Vault secret and the reference row.
 */
export async function deleteUserApiKey(
  userId: string,
  keyName: ApiKeyName
): Promise<void> {
  const supabase = getSupabase()

  // Get the vault secret ID
  const { data: keyRow } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("key_name", keyName)
    .single()

  if (keyRow?.encrypted_key) {
    // Delete vault secret first
    await supabase.rpc("delete_secret", { secret_id: keyRow.encrypted_key })
  }

  // Delete the key reference row
  await supabase
    .from("user_api_keys")
    .delete()
    .eq("user_id", userId)
    .eq("key_name", keyName)
}

/**
 * Fetch all of a user's decrypted API keys as a flat map.
 * Returns Record<string, string> e.g. { supermemory: "sk-...", openai: "sk-..." }
 * Suitable for passing directly to getProviderConfig/getJudgeConfig.
 * Uses two queries: one for key rows, one batch lookup against decrypted_secrets.
 */
export async function fetchAllUserKeys(
  userId: string
): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {}

  const supabase = getSupabase()

  // 1. Get all key rows (key_name + vault secret ID) in one query
  const { data: keyRows, error } = await supabase
    .from("user_api_keys")
    .select("key_name, encrypted_key")
    .eq("user_id", userId)

  if (error || !keyRows || keyRows.length === 0) return {}

  // 2. Batch-decrypt all vault secret IDs in one query
  const secretIds = keyRows.map((row: any) => row.encrypted_key)
  const { data: secrets, error: secretsError } = await supabase
    .from("decrypted_secrets")
    .select("id, decrypted_secret")
    .in("id", secretIds)

  if (secretsError || !secrets) return {}

  // Build id -> decrypted value lookup
  const secretMap = new Map<string, string>()
  for (const s of secrets) {
    if (s.decrypted_secret) secretMap.set(s.id, s.decrypted_secret)
  }

  // 3. Map key_name -> decrypted value
  const result: Record<string, string> = {}
  for (const row of keyRows) {
    const value = secretMap.get(row.encrypted_key)
    if (value) result[row.key_name] = value
  }

  return result
}

/**
 * List a user's API key names (no values, no secret IDs).
 */
export async function listUserApiKeyNames(userId: string): Promise<string[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("key_name")
    .eq("user_id", userId)

  if (error || !data) return []
  return data.map((row: any) => row.key_name)
}
