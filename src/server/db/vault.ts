import { SQL } from "bun"
import { config } from "../../utils/config"

/**
 * Ensure the DATABASE_URL uses session-mode pooling (port 5432).
 * Session mode supports the vault extension, unlike transaction mode (port 6543).
 * We keep the pooler hostname — direct hostname requires IP allowlisting.
 */
function toSessionModeUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.hostname.includes(".pooler.supabase.com") && parsed.port === "6543") {
    parsed.port = "5432"
  }
  return parsed.toString()
}

function getConnection(): InstanceType<typeof SQL> {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL not set — cannot access vault")
  }
  return new SQL(toSessionModeUrl(config.databaseUrl))
}

/**
 * Read a decrypted secret by its vault ID.
 */
export async function getDecryptedSecret(secretId: string): Promise<string | null> {
  const sql = getConnection()
  try {
    const rows = await sql.unsafe(
      `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1`,
      [secretId]
    )
    return rows.length > 0 ? rows[0].decrypted_secret : null
  } finally {
    await sql.close()
  }
}

/**
 * Batch-read decrypted secrets by their vault IDs.
 * Returns a Map of id -> decrypted_secret.
 */
export async function getDecryptedSecrets(
  secretIds: string[]
): Promise<Map<string, string>> {
  if (secretIds.length === 0) return new Map()
  const sql = getConnection()
  try {
    const rows = await sql`
      SELECT id, decrypted_secret
      FROM vault.decrypted_secrets
      WHERE id = ANY(${sql.array(secretIds, "UUID")})
    `
    const result = new Map<string, string>()
    for (const row of rows) {
      if (row.decrypted_secret) result.set(row.id, row.decrypted_secret)
    }
    return result
  } finally {
    await sql.close()
  }
}

/**
 * Create a new vault secret. Returns the secret's UUID.
 */
export async function createSecret(secret: string, name: string): Promise<string> {
  const sql = getConnection()
  try {
    const rows = await sql.unsafe(
      `SELECT vault.create_secret($1, $2) AS id`,
      [secret, name]
    )
    return rows[0].id
  } finally {
    await sql.close()
  }
}

/**
 * Delete a vault secret by ID. Returns the deleted secret's UUID.
 */
export async function deleteSecret(secretId: string): Promise<string | null> {
  const sql = getConnection()
  try {
    const rows = await sql.unsafe(
      `DELETE FROM vault.secrets WHERE id = $1::uuid RETURNING id`,
      [secretId]
    )
    return rows.length > 0 ? rows[0].id : null
  } finally {
    await sql.close()
  }
}

/**
 * Find a vault secret ID by name.
 */
export async function findSecretByName(name: string): Promise<string | null> {
  const sql = getConnection()
  try {
    const rows = await sql.unsafe(
      `SELECT id FROM vault.decrypted_secrets WHERE name = $1`,
      [name]
    )
    return rows.length > 0 ? rows[0].id : null
  } finally {
    await sql.close()
  }
}
