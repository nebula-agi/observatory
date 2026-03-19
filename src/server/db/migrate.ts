import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { SQL } from "bun"
import { config } from "../../utils/config"
import { logger } from "../../utils/logger"

/**
 * Ensure the DATABASE_URL uses session-mode pooling (port 5432).
 * Session mode supports DDL and SET commands, unlike transaction mode (port 6543).
 * We keep the pooler hostname as-is — the direct hostname (db.*.supabase.co)
 * requires IP allowlisting which may not include the K3s instance.
 */
function toSessionModeUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.hostname.includes(".pooler.supabase.com") && parsed.port === "6543") {
    parsed.port = "5432"
  }
  return parsed.toString()
}

/**
 * Auto-run database migrations on server startup.
 * Uses a session-mode Postgres connection via Bun's built-in SQL client.
 * Tracks applied migrations in a `schema_migrations` table.
 */
export async function runMigrations(): Promise<void> {
  if (!config.databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping auto-migrations")
    return
  }

  const sessionUrl = toSessionModeUrl(config.databaseUrl)
  const sql = new SQL(sessionUrl)

  try {
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
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`)

    // Get already-applied migrations
    const applied = await sql.unsafe(`SELECT version FROM public.schema_migrations`)
    const appliedSet = new Set(applied.map((r: any) => r.version))

    // If tracking table is empty but DB already has tables, seed with pre-existing migrations
    if (appliedSet.size === 0) {
      const tables = await sql.unsafe(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'runs' LIMIT 1`
      )
      if (tables.length > 0) {
        const preExisting = migrationFiles
          .map((f) => f.replace(/\.sql$/, ""))
          .filter((v) => v <= "005_add_retrieval_column")
        if (preExisting.length > 0) {
          const values = preExisting.map((v) => `('${v}')`).join(", ")
          await sql.unsafe(`INSERT INTO public.schema_migrations (version) VALUES ${values} ON CONFLICT DO NOTHING`)
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

      let migrationSql: string
      try {
        migrationSql = readFileSync(join(migrationsDir, file), "utf8")
      } catch {
        logger.error(`Could not read migration file: ${file}`)
        return
      }

      try {
        await sql.unsafe(migrationSql)
      } catch (err: any) {
        logger.error(
          `Migration ${file} failed: ${err.message}\n` +
            `  Please run it manually in your Supabase Dashboard → SQL Editor`
        )
        return
      }

      await sql.unsafe(`INSERT INTO public.schema_migrations (version) VALUES ('${version}')`)
      logger.success(`Migration ${file} applied successfully`)
    }
  } finally {
    await sql.close()
  }
}
