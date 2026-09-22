import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { Card, CardContent } from '@pleadli/ui/card'
import type { ReactNode } from 'react'

export type StatTileTint = 'primary' | 'amber' | 'rose' | 'emerald'

const statTileTintClasses: Record<StatTileTint, string> = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

export type StatTileProps = {
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  tint: StatTileTint
  value: ReactNode
  meta?: ReactNode
  caption: ReactNode
}

/** Shared across every Overview (Facility and Head Office alike): a
 * colored icon badge, a big number, and a one line caption, so both
 * roles' dashboards read as one visual system rather than two unrelated
 * designs that happen to share a sidebar. */
export function StatTile({ label, icon, tint, value, meta, caption }: StatTileProps) {
  return (
    <Card className="h-full gap-3 p-0">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', statTileTintClasses[tint])}>
            <HugeiconsIcon icon={icon} size={16} />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums text-foreground">{value}</span>
            {meta}
          </div>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </CardContent>
    </Card>
  )
}
