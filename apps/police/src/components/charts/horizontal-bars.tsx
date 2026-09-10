import { cn } from '@pleadli/ui/lib/utils'

// Semantic state, not a categorical palette — reserved for when a bar's
// label genuinely means good/warning/critical (a rejected referral, an
// overdue custody outcome), never assigned by position or for variety.
// 'default' is the ordinary case: magnitude only, no status meaning.
export type BarTone = 'default' | 'success' | 'warning' | 'critical'

export type BarDatum = {
  label: string
  value: number
  tone?: BarTone
}

const toneClassName: Record<BarTone, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
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
      {rows.map(({ label, value, tone = 'default' }) => {
        const pct = Math.round((value / max) * 100)
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-[0.625rem] text-muted-foreground" title={label}>
              {label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', toneClassName[tone], barClassName)}
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