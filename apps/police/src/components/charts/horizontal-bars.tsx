import { cn } from '@pleadli/ui/lib/utils'

export type BarDatum = {
  label: string
  value: number
}

type HorizontalBarsProps = {
  rows: readonly BarDatum[]
  max: number
  barClassName?: string
  className?: string
}

export const HorizontalBars = ({
  rows,
  max,
  barClassName,
  className
}: HorizontalBarsProps) => {
  if (max <= 0) return null
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {rows.map(({ label, value }) => {
        const pct = Math.round((value / max) * 100)
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 truncate text-[0.625rem] text-muted-foreground">
              {label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full bg-primary', barClassName)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs/tight tabular-nums">{value}</span>
          </div>
        )
      })}
    </div>
  )
}