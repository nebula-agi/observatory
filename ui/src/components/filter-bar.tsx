import { Search } from "lucide-react"
import { MultiSelect } from "./multi-select"

interface FilterConfig {
  key: string
  label: string
  options: { value: string; label: string; count?: number }[]
  selected: string[]
  onChange: (selected: string[]) => void
}

interface FilterBarProps {
  totalCount: number
  filteredCount?: number
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters: FilterConfig[]
  onClearAll: () => void
}

export function FilterBar({
  totalCount,
  filteredCount,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  onClearAll,
}: FilterBarProps) {
  const hasActiveFilters = searchValue || filters.some((f) => f.selected.length > 0)
  const displayCount = filteredCount !== undefined ? filteredCount : totalCount

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between text-sm px-1">
        <span className="text-text-secondary">
          Showing {displayCount} {displayCount === 1 ? "entry" : "entries"}
        </span>
        <button
          type="button"
          className={`text-text-muted hover:text-text-primary transition-colors cursor-pointer ${
            !hasActiveFilters ? "opacity-50" : ""
          }`}
          onClick={onClearAll}
        >
          Clear filters
        </button>
      </div>

      {/* Filter bar - connects to table below */}
      <div className="flex border border-border rounded-t">
        {/* Search input */}
        <div className="w-[240px] border-r border-border">
          <div className="relative h-[44px] flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-full pl-9 pr-3 text-sm bg-transparent text-text-primary placeholder-text-muted focus:outline-none cursor-text"
            />
          </div>
        </div>

        {/* Filter dropdowns */}
        {filters.map((filter, idx) => (
          <div
            key={filter.key}
            className={`flex-1 ${idx < filters.length - 1 ? "border-r border-border" : ""}`}
          >
            <MultiSelect
              label={filter.label}
              options={filter.options}
              selected={filter.selected}
              onChange={filter.onChange}
              placeholder={filter.label}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
