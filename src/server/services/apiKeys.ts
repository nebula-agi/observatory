import {
  getDecryptedSecret,
  getDecryptedSecrets,
  createSecret,
  deleteSecret,
  findSecretByName,
} from "../db/vault"

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

function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.DATABASE_URL)
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

  // Decrypt via direct Postgres connection to vault
  return getDecryptedSecret(keyRow.encrypted_key)
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

  // Delete any existing vault secret — check both the key reference and vault by name
  // to handle orphaned secrets from prior failed deletes
  const secretName = `${userId}_${keyName}`

  const { data: existing } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("key_name", keyName)
    .single()

  if (existing?.encrypted_key) {
    await deleteSecret(existing.encrypted_key)
  }

  // Also clean up any orphaned vault secret with the same name
  const orphanedId = await findSecretByName(secretName)
  if (orphanedId) {
    await deleteSecret(orphanedId)
  }

  // Create new vault secret
  const newSecretId = await createSecret(key, secretName)

  // Upsert the key reference
  const { error: upsertError } = await supabase.from("user_api_keys").upsert(
    {
      user_id: userId,
      key_name: keyName,
      encrypted_key: newSecretId,
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
    await deleteSecret(keyRow.encrypted_key)
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

  // 2. Batch-decrypt all vault secret IDs via direct Postgres
  const secretIds = keyRows.map((row: any) => row.encrypted_key)
  const secretMap = await getDecryptedSecrets(secretIds)

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
