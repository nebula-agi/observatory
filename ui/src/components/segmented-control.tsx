interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  selected: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  options,
  selected,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-bg-primary/40 p-0.5">
      {options.map((option) => {
        const isSelected = selected === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => !option.disabled && onChange(option.value)}
            className={`
              px-3 py-1 text-sm font-medium rounded-md transition-all duration-150
              font-display cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-primary
              ${
                option.disabled
                  ? "text-text-muted/50 cursor-not-allowed opacity-50"
                  : isSelected
                    ? "bg-bg-elevated text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-surface/50"
              }
            `}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
