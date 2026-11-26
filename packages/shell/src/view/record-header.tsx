import { cn } from '@pleadli/ui/lib/utils'
import { useState, type ReactNode } from 'react'

export type RecordFact = {
  label: string
  value: ReactNode
  /** Show a Copy button. Only for a plain-text value people quote to others. */
  copy?: string | null
}

export type RecordHeaderProps = {
  /** The trail back, already rendered (links belong to the app's router). */
  crumb?: ReactNode
  title: ReactNode
  /** A status tag beside the title. */
  tag?: ReactNode
  /** One quiet line under the title, like ULII's "Chapter 128". */
  subtitle?: ReactNode
  /** Labelled facts, one array per column. Empty columns are left out. */
  facts?: RecordFact[][]
  actions?: ReactNode
  copyLabel?: string
  copiedLabel?: string
  className?: string
}

function Row({ fact, copyLabel, copiedLabel }: { fact: RecordFact; copyLabel: string; copiedLabel: string }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <dt className="m-0 font-medium text-muted-foreground">{fact.label}</dt>
      <dd className="m-0 ms-0 flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{fact.value}</span>
        {fact.copy && (
          <button
            type="button"
            className="cursor-pointer rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
            onClick={() => {
              const text = fact.copy ?? ''
              void navigator.clipboard
                ?.writeText(text)
                .then(() => {
                  setDone(true)
                  setTimeout(() => setDone(false), 1500)
                })
                .catch(() => {})
            }}
          >
            {done ? copiedLabel : copyLabel}
          </button>
        )}
      </dd>
    </>
  )
}

/** The header every record page shares, after ULII's document page: a trail, a
 * title with its status and one quiet line, then a plain block of labelled
 * facts. The tabs sit under it (see RecordTabsView). */
export function RecordHeader({ crumb, title, tag, subtitle, facts = [], actions, copyLabel = 'Copy', copiedLabel = 'Copied', className }: RecordHeaderProps) {
  const columns = facts.filter((c) => c.length > 0)
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {crumb && <nav aria-label="breadcrumb" className="text-[0.8125rem] text-muted-foreground">{crumb}</nav>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 tracking-tight">{title}</h1>
          {tag}
        </div>
        {subtitle && <p className="m-0 text-muted-foreground">{subtitle}</p>}
        {columns.length > 0 && (
          <div className={cn('not-typeset mt-2 grid gap-x-12 gap-y-1 text-sm', columns.length > 1 && 'md:grid-cols-2')}>
            {columns.map((col, i) => (
              <dl key={i} className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
                {col.map((f) => (
                  <Row key={f.label} fact={f} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                ))}
              </dl>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
