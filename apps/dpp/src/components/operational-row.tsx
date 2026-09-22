import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

/** A run of rows divided by hairlines, with no box around it. Plain divs with
 * list roles rather than `ul`, because the content typography gives a `ul`
 * bullets and a `li > p` extra margin. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="list" className={cn('flex flex-col divide-y divide-border/60 border-y border-border/60', className)}>
      {children}
    </div>
  )
}

type RowProps = {
  /** `urgent` marks something genuinely time-critical, `open` something that
   * needs action, and nothing (the default) leaves the row unmarked. */
  marker?: 'urgent' | 'open'
  /** Reserve the marker's column even when this row has no marker, so a list
   * with some marked rows keeps its text aligned. */
  aligned?: boolean
  title: ReactNode
  summary?: ReactNode
  trailing?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * One row of an operational list: a title, one line saying what it is about,
 * and what can be done, at the right. Used wherever the page answers "what is
 * this and what do I do", so a queue, a list of today's work and a list of
 * facilities read as one family.
 */
export function Row({ marker, aligned, title, summary, trailing, children, className }: RowProps) {
  return (
    <div role="listitem" className={cn('flex flex-col', className)}>
      <div className="flex items-start gap-3 py-3">
        {(marker || aligned) && (
          <span
            aria-hidden
            className={cn('mt-[0.55rem] size-1.5 shrink-0 rounded-full', marker === 'urgent' && 'bg-destructive', marker === 'open' && 'border border-muted-foreground/70')}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong>{title}</strong>
          {summary && <p>{summary}</p>}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      {children}
    </div>
  )
}
