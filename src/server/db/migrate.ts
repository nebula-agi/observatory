import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { config } from "../../utils/config"
import { logger } from "../../utils/logger"

/**
 * Auto-run database migrations on server startup.
 * Uses Supabase's pg-meta API to execute raw SQL.
 * Tracks applied migrations in a `schema_migrations` table.
 */
export async function runMigrations(): Promise<void> {
  const { supabase } = require("./supabase")

  const supabaseUrl = config.supabaseUrl
  const serviceRoleKey = config.supabaseServiceRoleKey

  // Discover all migration files sorted by name
  const migrationsDir = join(process.cwd(), "supabase", "migrations")
  let migrationFiles: string[]
  try {
    migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
  } catch {
    logger.error(`Migrations directory not found at ${migrationsDir}`)
    return
  }

  if (migrationFiles.length === 0) return

  // Ensure the tracking table exists
  await executeSql(
    supabaseUrl,
    serviceRoleKey,
    `CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`
  )

  // Get already-applied migrations
  const { data: applied } = await supabase
    .from("schema_migrations")
    .select("version")

  const appliedSet = new Set((applied ?? []).map((r: any) => r.version))

  // If tracking table is empty but DB already has tables, seed with pre-existing migrations
  if (appliedSet.size === 0) {
    const { error: tableCheck } = await supabase.from("runs").select("id").limit(0)
    if (!tableCheck) {
      const preExisting = migrationFiles
        .map((f) => f.replace(/\.sql$/, ""))
        .filter((v) => v <= "005_add_retrieval_column")
      if (preExisting.length > 0) {
        await supabase
          .from("schema_migrations")
          .insert(preExisting.map((version) => ({ version })))
        for (const v of preExisting) appliedSet.add(v)
        logger.info(`Seeded schema_migrations with ${preExisting.length} pre-existing migrations`)
      }
    }
  }

  // Run pending migrations in order
  for (const file of migrationFiles) {
    const version = file.replace(/\.sql$/, "")
    if (appliedSet.has(version)) continue

    logger.info(`Running migration: ${file}`)

    let sql: string
    try {
      sql = readFileSync(join(migrationsDir, file), "utf8")
    } catch {
      logger.error(`Could not read migration file: ${file}`)
      return
    }

    const success = await executeSql(supabaseUrl, serviceRoleKey, sql)
    if (!success) {
      logger.error(
        `Migration ${file} failed. Please run it manually:\n` +
          `  1. Go to your Supabase Dashboard → SQL Editor\n` +
          `  2. Paste contents of: supabase/migrations/${file}\n` +
          `  3. Click "Run"\n` +
          `  4. Restart the server`
      )
      return
    }

    // Record the migration as applied
    await supabase
      .from("schema_migrations")
      .insert({ version })

    logger.success(`Migration ${file} applied successfully`)
  }
}

async function executeSql(
  supabaseUrl: string,
  serviceRoleKey: string,
  sql: string
): Promise<boolean> {
  const endpoints = [
    `${supabaseUrl}/pg/query`,
    `${supabaseUrl}/pg-meta/default/query`,
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      })

      if (response.ok) return true

      const body = await response.text()
      logger.warn(`Migration endpoint ${endpoint} returned ${response.status}: ${body.slice(0, 200)}`)
    } catch {
      // Endpoint not available, try next
    }
  }

  return false
}
