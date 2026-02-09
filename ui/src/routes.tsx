import { Routes, Route, Navigate } from "react-router-dom"
import { RootLayout } from "./components/layout/RootLayout"
import RunsPage from "./pages/RunsPage"
import RunDetailPage from "./pages/RunDetailPage"
import LeaderboardPage from "./pages/LeaderboardPage"
import LeaderboardEntryPage from "./pages/LeaderboardEntryPage"
import LeaderboardComparePage from "./pages/LeaderboardComparePage"
import SettingsPage from "./pages/SettingsPage"
import MethodologyPage from "./pages/MethodologyPage"
import ProviderPage from "./pages/ProviderPage"

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<Navigate to="/leaderboard" replace />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/runs/:runId" element={<RunDetailPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/leaderboard/compare" element={<LeaderboardComparePage />} />
        <Route path="/leaderboard/:id" element={<LeaderboardEntryPage />} />
        <Route path="/providers/:provider" element={<ProviderPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
