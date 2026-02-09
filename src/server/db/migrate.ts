import { readFileSync } from "fs"
import { join } from "path"
import { config } from "../../utils/config"
import { logger } from "../../utils/logger"

/**
 * Auto-run database migrations on server startup.
 * Uses Supabase's pg-meta API to execute raw SQL.
 * Checks if tables exist first to avoid unnecessary work.
 */
export async function runMigrations(): Promise<void> {
  const { supabase } = require("./supabase")

  // Check if tables already exist by querying the runs table
  const { error } = await supabase.from("runs").select("id").limit(0)

  if (!error) {
    // Tables exist, no migration needed
    return
  }

  // Any error querying runs table means we need to migrate
  logger.info("Database tables not found. Running initial migration...")

  const migrationPath = join(process.cwd(), "supabase", "migrations", "001_initial_schema.sql")
  let sql: string
  try {
    sql = readFileSync(migrationPath, "utf8")
  } catch {
    logger.error(
      `Migration file not found at ${migrationPath}. ` +
        `Please run the SQL manually in your Supabase Dashboard SQL Editor.`
    )
    return
  }

  // Execute via Supabase's pg-meta REST API
  const supabaseUrl = config.supabaseUrl
  const serviceRoleKey = config.supabaseServiceRoleKey

  // Try multiple known pg-meta endpoints
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

      if (response.ok) {
        // Verify tables were created
        const { error: verifyError } = await supabase.from("runs").select("id").limit(0)
        if (!verifyError) {
          logger.success("Database migration completed successfully")
          return
        }
      }

      const body = await response.text()
      logger.warn(`Migration endpoint ${endpoint} returned ${response.status}: ${body.slice(0, 200)}`)
    } catch {
      // Endpoint not available, try next
    }
  }

  // All endpoints failed — print manual instructions
  logger.error(
    `Auto-migration could not connect to pg-meta API. Please run the migration manually:\n` +
      `  1. Go to your Supabase Dashboard → SQL Editor\n` +
      `  2. Paste contents of: supabase/migrations/001_initial_schema.sql\n` +
      `  3. Click "Run"\n` +
      `  4. Restart the server`
  )
}
