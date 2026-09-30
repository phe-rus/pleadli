import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'

export type Bar = { key: string; label: string; value: number; display?: string }

/** Counts by category: one hue (the practice's own colour), a thin bar per
 * row with its number written beside it, so nothing is read off an axis and
 * nothing depends on colour. The same rows are a table for a screen reader. */
export function BarList({ rows, caption, className }: { rows: readonly Bar[]; caption: string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className={cn('relative flex flex-col gap-2.5', className)}>
      <ul className="not-typeset flex flex-col gap-2.5" aria-hidden>
        {rows.map((row) => (
          <li key={row.key} className="group grid grid-cols-[minmax(0,15rem)_1fr_auto] items-center gap-x-3" title={`${row.label}: ${row.display ?? row.value}`}>
            <span className="line-clamp-2 text-sm leading-snug text-muted-foreground group-hover:text-foreground">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted/60">
              <span className="block h-full rounded-full bg-primary transition-[width] group-hover:bg-primary/80" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="min-w-8 text-right text-sm tabular-nums text-foreground">{row.display ?? row.value}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.display ?? row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Twelve monthly counts as columns on one baseline, with the hovered month's
 * figure shown above the chart. Month names in the reader's language. */
export function MonthColumns({ values, year, caption, locale }: { values: readonly number[]; year: number; caption: string; locale: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const month = (i: number, style: 'short' | 'long') => new Intl.DateTimeFormat(locale, { month: style }).format(new Date(year, i, 1))
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <figure className="not-typeset relative flex flex-col gap-2">
      <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
        {hover === null ? ' ' : `${month(hover, 'long')} ${year}: ${values[hover]}`}
      </p>
      <div className="flex h-28 items-end gap-1 border-b border-border/60" aria-hidden onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1 px-0.5" onMouseEnter={() => setHover(i)}>
            {v > 0 && <span className="text-xs tabular-nums text-muted-foreground">{v}</span>}
            <div
              className={cn('w-full max-w-8 rounded-t-[4px] bg-primary transition-opacity', hover !== null && hover !== i && 'opacity-40', v === 0 && 'bg-transparent')}
              style={{ height: v === 0 ? 0 : `max(4px, calc(${(v / max) * 100}% - 1.25rem))` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1" aria-hidden>
        {values.map((_, i) => (
          <span key={i} className="flex-1 text-center text-xs text-muted-foreground">
            {month(i, 'short')}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{`${caption} (${total})`}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{month(i, 'long')}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
