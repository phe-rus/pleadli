import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export type SettingsRow = {
  key: string
  label: string
  description?: ReactNode
  control: ReactNode
  /** Extra content spanning the full row width, below the label/control
   * line: a status line, a form, anything that doesn't fit a single row. */
  expanded?: ReactNode
}

/** Rows of settings drawn as DPP's System Settings group: one white rounded
 * surface, hairlines between rows, the name and a grey line on the left, the
 * control on the right. */
export function SettingsTable({ rows, className }: { rows: SettingsRow[]; className?: string }) {
  return (
    <div className={cn('flex w-full flex-col divide-y divide-border/60 overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border/70', className)}>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 flex-col">
              <span>{row.label}</span>
              {row.description && <p className="text-[0.8125rem] text-muted-foreground">{row.description}</p>}
            </div>
            {row.control && <div className="shrink-0">{row.control}</div>}
          </div>
          {row.expanded}
        </div>
      ))}
    </div>
  )
}
