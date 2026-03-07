import { useEffect, useState, useCallback } from "react"
import { getActiveDownloads, type ActiveDownload } from "@/lib/api"

const POLL_INTERVAL = 1000 // 1 second polling

interface DownloadToastProps {
  onDownloadComplete?: () => void
}

export function DownloadToast({ onDownloadComplete }: DownloadToastProps) {
  const [downloads, setDownloads] = useState<ActiveDownload[]>([])
  const [wasDownloading, setWasDownloading] = useState(false)

  const fetchDownloads = useCallback(async () => {
    try {
      const data = await getActiveDownloads()
      setDownloads(data.downloads)

      // Detect when download completes
      if (wasDownloading && data.downloads.length === 0) {
        onDownloadComplete?.()
        setWasDownloading(false)
      } else if (data.downloads.length > 0) {
        setWasDownloading(true)
      }
    } catch {
      // Silent fail - API might not be available
    }
  }, [wasDownloading, onDownloadComplete])

  useEffect(() => {
    fetchDownloads()
    const interval = setInterval(fetchDownloads, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchDownloads])

  if (downloads.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 animate-fade-in">
      {downloads.map((download) => (
        <div
          key={download.benchmark}
          className="rounded-lg border border-border p-4 min-w-[280px] bg-bg-surface"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-text-primary">
              {download.displayName}
            </span>
            <span className="text-xs text-text-muted ml-auto">Downloading</span>
          </div>

          {/* Indeterminate progress bar */}
          <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full animate-indeterminate"
              style={{
                width: "30%",
                background: "linear-gradient(90deg, #5040ff 0%, #7366ff 100%)",
              }}
            />
          </div>

          {/* Status text */}
          <div className="text-xs text-text-secondary">Downloading dataset...</div>
        </div>
      ))}
    </div>
  )
}
