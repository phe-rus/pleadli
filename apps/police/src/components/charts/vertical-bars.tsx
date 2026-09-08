import { cn } from '@pleadli/ui/lib/utils'
import type { BarDatum } from './horizontal-bars'

type VerticalBarsProps = {
  rows: readonly BarDatum[]
  max: number
  barClassName?: string
  className?: string
}

export const VerticalBars = ({ rows, max, barClassName, className }: VerticalBarsProps) => {
  if (max <= 0) return null
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      {rows.map(({ label, value }) => {
        const pct = Math.round((value / max) * 100)
        return (
          <div
            key={label}
            className="group/bar flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <h1 className="font-heading text-xs text-muted-foreground tabular-nums">
              {value}
            </h1>
            <div className="flex h-36 w-full items-end rounded-full bg-muted/55">
              <div
                className={cn(
                  'w-full rounded-t-md bg-primary transition-all',
                  'group-hover/bar:brightness-110 rounded-full',
                  barClassName,
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        )
      })}
    </div>
  )
}