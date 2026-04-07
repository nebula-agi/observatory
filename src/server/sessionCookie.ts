export const OBSERVATORY_SESSION_COOKIE = "observatory_session"

type SessionCookie = {
  value: string
  maxAge?: number
}

type SessionCookieOp =
  | { action: "set"; sessionId: string; maxAge?: number }
  | { action: "clear" }

const queuedSessionCookies = new WeakMap<Request, SessionCookieOp>()

function isSecureRequest(req: Request): boolean {
  const forwardedProto = req.headers.get("x-forwarded-proto")
  return forwardedProto === "https" || new URL(req.url).protocol === "https:"
}

export function extractCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function getSessionIdFromRequest(req: Request): string | null {
  return extractCookieValue(req.headers.get("cookie"), OBSERVATORY_SESSION_COOKIE)
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers)
  }

  const setCookieHeader = headers.get("set-cookie")
  return setCookieHeader ? [setCookieHeader] : []
}

export function extractSetCookie(headers: Headers, name: string): SessionCookie | null {
  for (const setCookieHeader of getSetCookieHeaders(headers)) {
    const valueMatch = setCookieHeader.match(new RegExp(`${name}=([^;]*)`))
    if (!valueMatch) continue

    const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i)
    return {
      value: decodeURIComponent(valueMatch[1]),
      maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : undefined,
    }
  }

  return null
}

export function setSessionCookie(
  headers: Headers,
  req: Request,
  sessionId: string,
  maxAge?: number,
): void {
  const parts = [
    `${OBSERVATORY_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`)
  if (isSecureRequest(req)) parts.push("Secure")
  headers.append("Set-Cookie", parts.join("; "))
}

export function clearSessionCookie(headers: Headers, req: Request): void {
  const parts = [
    `${OBSERVATORY_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ]
  if (isSecureRequest(req)) parts.push("Secure")
  headers.append("Set-Cookie", parts.join("; "))
}

export function queueSessionCookieSet(
  req: Request,
  sessionId: string,
  maxAge?: number,
): void {
  queuedSessionCookies.set(req, { action: "set", sessionId, maxAge })
}

export function queueSessionCookieClear(req: Request): void {
  queuedSessionCookies.set(req, { action: "clear" })
}

export function applyQueuedSessionCookie(req: Request, headers: Headers): void {
  const op = queuedSessionCookies.get(req)
  if (!op) return

  queuedSessionCookies.delete(req)
  if (op.action === "clear") {
    clearSessionCookie(headers, req)
    return
  }

  setSessionCookie(headers, req, op.sessionId, op.maxAge)
}
