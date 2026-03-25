export interface FaviconTheme {
  light: string
  dark: string
}

export function updateFavicon(theme: "light" | "dark", faviconUrls: FaviconTheme): void {
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
  if (favicon) {
    favicon.href = theme === "light" ? faviconUrls.light : faviconUrls.dark
  }
}

export function getPreferredTheme(): "light" | "dark" {
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }
  return "light"
}

export function setupThemeAwareFavicon(faviconUrls: FaviconTheme): () => void {
  const updateTheme = () => {
    updateFavicon(getPreferredTheme(), faviconUrls)
  }

  updateTheme()

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  mediaQuery.addEventListener("change", updateTheme)

  return () => {
    mediaQuery.removeEventListener("change", updateTheme)
  }
}
