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

/** Rows of a setting: its name and what it does on the left, the control on
 * the right (Claude's settings shape), inside a card frame so it lines up
 * with `SettingsCard`. Plain semantic tags only, so the global typography
 * does the styling and the hairline dividers come from the table rules. */
export function SettingsTable({ rows, className }: { rows: SettingsRow[]; className?: string }) {
  return (
    <div className={cn('w-full overflow-hidden rounded-lg border border-border bg-card', className)}>
      <table className="w-full">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border first:border-t-0">
              <td className="w-full p-4 align-top">
                <div className="flex flex-col gap-0.5">
                  <h4>{row.label}</h4>
                  {row.description && <p>{row.description}</p>}
                  {row.expanded && <div className="mt-2">{row.expanded}</div>}
                </div>
              </td>
              <td className="p-4 text-right align-top whitespace-nowrap">{row.control}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
