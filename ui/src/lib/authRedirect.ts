const OAUTH_RETURN_PATH_KEY = "observatory.oauth.return_path"

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">

export const DEFAULT_OAUTH_RETURN_PATH = "/leaderboard"

export function normalizeInAppReturnPath(returnPath: unknown): string | null {
  if (typeof returnPath !== "string") return null

  const candidate = returnPath.trim()
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return null
  }

  return candidate
}

function isAuthCallbackPath(returnPath: string): boolean {
  return returnPath === "/auth/callback" || returnPath.startsWith("/auth/callback?")
}

export function rememberOAuthReturnPathInStorage(storage: StorageLike, returnPath: unknown): void {
  const normalized = normalizeInAppReturnPath(returnPath)
  if (!normalized || isAuthCallbackPath(normalized)) {
    storage.removeItem(OAUTH_RETURN_PATH_KEY)
    return
  }

  storage.setItem(OAUTH_RETURN_PATH_KEY, normalized)
}

export function consumeOAuthReturnPathFromStorage(storage: StorageLike): string | null {
  const returnPath = storage.getItem(OAUTH_RETURN_PATH_KEY)
  storage.removeItem(OAUTH_RETURN_PATH_KEY)
  return normalizeInAppReturnPath(returnPath)
}

export function rememberOAuthReturnPath(returnPath: unknown): void {
  try {
    rememberOAuthReturnPathInStorage(window.sessionStorage, returnPath)
  } catch {
    // Ignore storage failures and fall back to the server-provided default target.
  }
}

export function consumeOAuthReturnPath(): string | null {
  try {
    return consumeOAuthReturnPathFromStorage(window.sessionStorage)
  } catch {
    return null
  }
}
