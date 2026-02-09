import { AppRoutes } from "./routes"
import { DownloadToast } from "./components/download-toast"

export function App() {
  const handleDownloadComplete = () => {
    window.location.reload()
  }

  return (
    <>
      <AppRoutes />
      <DownloadToast onDownloadComplete={handleDownloadComplete} />
    </>
  )
}
