export const ALLOWED_ORIGINS = (process.env.OBSERVATORY_ALLOWED_ORIGINS || "http://localhost:3003")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

export function isAllowedOrigin(origin: string | null): origin is string {
  return Boolean(origin && ALLOWED_ORIGINS.includes(origin))
}
