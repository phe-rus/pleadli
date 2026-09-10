import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export type SettingsRow = {
  key: string
  label: string
  description?: ReactNode
  control: ReactNode
  /** Extra content spanning the full row width, below the label/control
   * line — for a QR code, a status line, anything that doesn't fit a
   * single row's height. */
  expanded?: ReactNode
}

/** The settings-list look used across Settings and Station Admin: a
 * real table, so each row gets a hairline divider for free from the
 * app's own global typeset CSS — no card, no outer border, just plain
 * divided rows like everything else in this app. */
export function SettingsTable({ rows, className }: { rows: SettingsRow[]; className?: string }) {
  return (
    <table className={cn('w-full', className)}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="w-full align-top">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{row.label}</span>
                {row.description && <span className="text-xs text-muted-foreground">{row.description}</span>}
                {row.expanded && <div className="mt-2">{row.expanded}</div>}
              </div>
            </td>
            <td className="text-right align-top whitespace-nowrap">{row.control}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
