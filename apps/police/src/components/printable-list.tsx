import * as m from '@/paraglide/messages'
import { format } from '@/lib/date'

export type PrintableFieldProps = {
  label: string
  value: React.ReactNode
}

/** A label/value row for a `/print` route's identity block. */
export function PrintableField({ label, value }: PrintableFieldProps) {
  return (
    <div className="flex gap-3 border-b border-border/40 py-1">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export type PrintableSectionProps = {
  title: string
  count: number
  children: React.ReactNode
}

/** A titled group of `PrintableRow`s on a `/print` route, with a count
 * and a "None recorded." fallback. */
export function PrintableSection({ title, count, children }: PrintableSectionProps) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {title} ({count})
      </h2>
      {count === 0 ? <p className="text-xs text-muted-foreground">{m["common.none_recorded"]()}</p> : <div className="flex flex-col">{children}</div>}
    </section>
  )
}

export type PrintableRowProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  at: number
}

/** One dated row inside a `PrintableSection`. */
export function PrintableRow({ title, subtitle, at }: PrintableRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/20 py-1 text-xs">
      <div className="min-w-0">
        <p className="truncate">{title}</p>
        {subtitle && <p className="truncate text-muted-foreground">{subtitle}</p>}
      </div>
      <span className="shrink-0 text-muted-foreground">{format(at, 'PP')}</span>
    </div>
  )
}
