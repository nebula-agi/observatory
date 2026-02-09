import { ReactNode } from "react"
import { List, Trophy, BarChart3, FileText } from "lucide-react"

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-5 rounded-xl bg-gradient-to-br from-bg-elevated to-bg-surface flex items-center justify-center border border-border">
        {icon}
      </div>
      <h3 className="text-lg font-display font-medium text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-text-secondary text-sm max-w-md mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ListIcon() {
  return <List className="w-7 h-7 text-white" />
}

export function TrophyIcon() {
  return <Trophy className="w-7 h-7 text-white" />
}

export function ChartIcon() {
  return <BarChart3 className="w-7 h-7 text-white" />
}

export function DocumentIcon() {
  return <FileText className="w-7 h-7 text-white" />
}
