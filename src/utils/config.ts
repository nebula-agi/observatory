export interface Config {
  supermemoryApiKey: string
  supermemoryBaseUrl: string
  mem0ApiKey: string
  zepApiKey: string
  openaiApiKey: string
  anthropicApiKey: string
  googleApiKey: string
  nebulaApiKey: string
  nebulaBaseUrl: string
  nebulaJwksUrl: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  supabaseAnonKey: string
  databaseUrl: string
}

const nebulaBaseUrl = process.env.NEBULA_BASE_URL || "https://api.trynebula.ai"

export const config: Config = {
  supermemoryApiKey: process.env.SUPERMEMORY_API_KEY || "",
  supermemoryBaseUrl: process.env.SUPERMEMORY_BASE_URL || "https://api.supermemory.ai",
  mem0ApiKey: process.env.MEM0_API_KEY || "",
  zepApiKey: process.env.ZEP_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  nebulaApiKey: process.env.NEBULA_API_KEY || "",
  nebulaBaseUrl,
  nebulaJwksUrl:
    process.env.NEBULA_JWKS_URL ||
    new URL("/.well-known/jwks.json", nebulaBaseUrl).toString(),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
}

/**
 * Get provider config. If userKeys is provided, use those keys first,
 * falling back to env vars. userKeys is a map of key_name -> plaintext value.
 */
export function getProviderConfig(
  provider: string,
  userKeys?: Record<string, string>
): { apiKey: string; baseUrl?: string } {
  switch (provider) {
    case "supermemory":
      return {
        apiKey: userKeys?.supermemory || config.supermemoryApiKey,
        baseUrl: config.supermemoryBaseUrl,
      }
    case "mem0":
      return { apiKey: userKeys?.mem0 || config.mem0ApiKey }
    case "zep":
      return { apiKey: userKeys?.zep || config.zepApiKey }
    case "nebula":
      return {
        apiKey: userKeys?.nebula || config.nebulaApiKey,
        baseUrl: config.nebulaBaseUrl,
      }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Get judge config. If userKeys is provided, use those keys first,
 * falling back to env vars.
 */
export function getJudgeConfig(
  judge: string,
  userKeys?: Record<string, string>
): { apiKey: string; model?: string } {
  switch (judge) {
    case "openai":
      return { apiKey: userKeys?.openai || config.openaiApiKey }
    case "anthropic":
      return { apiKey: userKeys?.anthropic || config.anthropicApiKey }
    case "google":
      return { apiKey: userKeys?.google || config.googleApiKey }
    default:
      throw new Error(`Unknown judge: ${judge}`)
  }
}
