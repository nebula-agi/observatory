import { ReactNode } from "react"
import { cn } from "@/lib/utils"

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
  "[data-no-row-click]",
].join(",")

function shouldIgnoreRowClick(event: React.MouseEvent<HTMLTableRowElement>) {
  if (event.defaultPrevented) {
    return true
  }

  const path = typeof event.nativeEvent.composedPath === "function"
    ? event.nativeEvent.composedPath()
    : [event.target]

  return path.some((node) => node instanceof Element && !!node.closest(INTERACTIVE_SELECTOR))
}

export interface Column<T> {
  key: string
  header: string
  render: (item: T, index: number) => ReactNode
  align?: "left" | "center" | "right"
  width?: string
  headerClassName?: string
  cellClassName?: string
  filterElement?: ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  loading?: boolean
  getRowKey?: (item: T, index: number) => string | number
  connectToFilterBar?: boolean
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data found",
  loading = false,
  getRowKey,
  connectToFilterBar = true,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="py-16 text-center rounded-lg border border-border bg-bg-surface/30">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-text-secondary mt-3 text-sm">Loading...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="py-16 text-center rounded-lg border border-border bg-bg-surface/30">
        <p className="text-text-secondary text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "border border-border overflow-visible bg-bg-surface/30 backdrop-blur-sm",
        connectToFilterBar ? "rounded-b-lg border-t-0" : "rounded-lg"
      )}
    >
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "h-11 px-4 font-body text-left align-middle",
                  !col.filterElement &&
                    "text-[11px] font-medium text-text-muted uppercase tracking-widest",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  col.headerClassName
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.filterElement || col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={getRowKey ? getRowKey(item, idx) : idx}
              className={cn(
                "group border-b border-border last:border-0 transition-all duration-150",
                onRowClick && "cursor-pointer hover:bg-accent/[0.03]"
              )}
              onClick={(event) => {
                if (shouldIgnoreRowClick(event)) {
                  return
                }

                onRowClick?.(item)
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3.5 align-middle text-text-primary",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                    col.cellClassName
                  )}
                >
                  {col.render(item, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
