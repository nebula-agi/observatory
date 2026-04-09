import { createClient } from "@supabase/supabase-js"

type ProfileRow = {
  email: string | null
  id: string
  nebula_user_id: string | null
}

type NebulaUser = {
  email: string
  id: string
}

type ProfileUpdate = {
  email: string
  id: string
  nebula_user_id?: string
}

const WRITE_MODE = process.argv.includes("--write")
const PAGE_SIZE = 500

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function extractNebulaUsers(payload: any): { results: NebulaUser[]; totalEntries: number } {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.results?.results)
      ? payload.results.results
      : []

  const users = results
    .filter((row): row is { email: string; id: string } => {
      return typeof row?.email === "string" && typeof row?.id === "string"
    })
    .map((row) => ({
      email: normalizeEmail(row.email),
      id: row.id,
    }))

  const totalEntries =
    typeof payload?.total_entries === "number"
      ? payload.total_entries
      : typeof payload?.results?.total_entries === "number"
        ? payload.results.total_entries
        : users.length

  return { results: users, totalEntries }
}

async function fetchNebulaUsers(
  baseUrl: string,
  adminApiKey: string
): Promise<{ byEmail: Map<string, NebulaUser>; byId: Map<string, NebulaUser> }> {
  const usersByEmail = new Map<string, NebulaUser>()
  const usersById = new Map<string, NebulaUser>()
  let offset = 0
  let totalEntries = Number.POSITIVE_INFINITY

  while (offset < totalEntries) {
    const response = await fetch(`${baseUrl}/v1/users?offset=${offset}&limit=${PAGE_SIZE}`, {
      headers: {
        Authorization: `Bearer ${adminApiKey}`,
      },
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Failed to list Nebula users: ${response.status} ${message}`)
    }

    const payload = await response.json()
    const page = extractNebulaUsers(payload)
    totalEntries = page.totalEntries

    for (const user of page.results) {
      const existing = usersByEmail.get(user.email)
      if (existing && existing.id !== user.id) {
        throw new Error(`Nebula returned duplicate normalized email ${user.email}`)
      }
      usersByEmail.set(user.email, user)
      usersById.set(user.id, user)
    }

    if (page.results.length === 0) {
      break
    }
    offset += page.results.length
  }

  return { byEmail: usersByEmail, byId: usersById }
}

async function fetchProfiles(): Promise<ProfileRow[]> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
  const profiles: ProfileRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nebula_user_id")
      .order("id", { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load Observatory profiles: ${error.message}`)
    }

    const page = (data as ProfileRow[] | null) ?? []
    profiles.push(...page)
    if (page.length < PAGE_SIZE) {
      break
    }
  }

  return profiles
}

async function applyUpdates(updates: ProfileUpdate[]): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))

  for (const update of updates) {
    const { error } = await supabase
      .from("profiles")
      .update({
        email: update.email,
        nebula_user_id: update.nebula_user_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)

    if (error) {
      throw new Error(`Failed to update profile ${update.id}: ${error.message}`)
    }
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.NEBULA_BASE_URL || "https://api.trynebula.ai"
  const adminApiKey = requireEnv("NEBULA_ADMIN_API_KEY", process.env.NEBULA_API_KEY)
  const profiles = await fetchProfiles()
  const { byEmail: nebulaUsersByEmail, byId: nebulaUsersById } = await fetchNebulaUsers(
    baseUrl,
    adminApiKey
  )
  const duplicateProfileEmails = new Map<string, ProfileRow[]>()
  const unresolved: string[] = []
  const updates: ProfileUpdate[] = []

  for (const profile of profiles) {
    if (profile.email) {
      const normalizedEmail = normalizeEmail(profile.email)
      const bucket = duplicateProfileEmails.get(normalizedEmail) ?? []
      bucket.push(profile)
      duplicateProfileEmails.set(normalizedEmail, bucket)
    }
  }

  for (const [email, rows] of duplicateProfileEmails) {
    if (rows.length > 1) {
      unresolved.push(
        `Duplicate Observatory profiles share normalized email ${email}: ${rows
          .map((row) => row.id)
          .join(", ")}`
      )
    }
  }

  for (const profile of profiles) {
    if (!profile.email) {
      if (!profile.nebula_user_id) {
        unresolved.push(`Profile ${profile.id} has no email and no nebula_user_id`)
      } else if (!nebulaUsersById.has(profile.nebula_user_id)) {
        unresolved.push(
          `Profile ${profile.id} references missing Nebula user ${profile.nebula_user_id}`
        )
      }
      continue
    }

    const normalizedEmail = normalizeEmail(profile.email)
    const linkedNebulaUser = profile.nebula_user_id
      ? nebulaUsersById.get(profile.nebula_user_id)
      : null
    const nebulaUser = linkedNebulaUser ?? nebulaUsersByEmail.get(normalizedEmail)

    if (!nebulaUser) {
      unresolved.push(
        `No Nebula user found for Observatory profile ${profile.id} (${normalizedEmail})`
      )
      continue
    }

    if (
      !profile.nebula_user_id ||
      profile.nebula_user_id !== nebulaUser.id ||
      profile.email !== nebulaUser.email
    ) {
      updates.push({
        email: nebulaUser.email,
        id: profile.id,
        nebula_user_id: nebulaUser.id,
      })
    }
  }

  console.log(`Loaded ${profiles.length} Observatory profiles`)
  console.log(`Loaded ${nebulaUsersByEmail.size} Nebula users`)
  console.log(`Planned updates: ${updates.length}`)

  if (unresolved.length > 0) {
    console.error("Migration blockers:")
    for (const issue of unresolved) {
      console.error(`- ${issue}`)
    }
    process.exit(1)
  }

  if (!WRITE_MODE) {
    console.log("Dry run complete. Re-run with --write to apply updates.")
    for (const update of updates.slice(0, 20)) {
      console.log(`- ${update.id}: email=${update.email} nebula_user_id=${update.nebula_user_id}`)
    }
    if (updates.length > 20) {
      console.log(`... and ${updates.length - 20} more`)
    }
    return
  }

  await applyUpdates(updates)
  console.log(`Applied ${updates.length} profile updates`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
