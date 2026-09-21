import { dueText } from './due'
import { useObligationActions } from './obligation-actions'
import { bucketLabels, bucketOf, type Bucket, type Obligation } from './schema'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'

type ObligationQueueProps = {
  obligations: readonly Obligation[]
  now: number
  emptyMessage: string
  /** Hide the section headings, for a short list such as exceptions. */
  flat?: boolean
}

/**
 * A queue where every row opens the procedure that discharges it
 * (docs/prisons/product/08 1.3). Court outcomes and threshold actions are
 * recorded in a drawer on the spot; everything else opens its page. Today
 * groups the same obligations as attention; this is the per-person list.
 */
export function ObligationQueue({ obligations, now, emptyMessage, flat }: ObligationQueueProps) {
  const { action, drawers } = useObligationActions()

  if (obligations.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const order: Bucket[] = ['overdue', 'today', 'soon', 'open']
  const grouped = order
    .map((bucket) => ({ bucket, items: obligations.filter((o) => bucketOf(o, now) === bucket) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <div className="flex flex-col gap-4">
        {grouped.map(({ bucket, items }) => (
          <section key={bucket} className="flex flex-col gap-1.5">
            {!flat && (
              <h3 className={cn('text-xs font-medium tracking-wide text-muted-foreground uppercase', bucket === 'overdue' && 'text-destructive')}>
                {bucketLabels[bucket]} ({items.length})
              </h3>
            )}
            <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
              {items.map((o) => (
                <li key={o.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{o.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {o.prisonerId && o.prisonerName ? (
                        <Link to="/prisoners/$prisonerId" params={{ prisonerId: o.prisonerId }} className="underline-offset-2 hover:underline">
                          {o.prisonerName}
                        </Link>
                      ) : (
                        o.prisonerName
                      )}
                      {o.detail ? ` · ${o.detail}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge variant={bucket === 'overdue' ? 'destructive' : 'outline'} className="text-[10px]">
                      {dueText(o, now, bucket)}
                    </Badge>
                    {action(o)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {drawers}
    </>
  )
}
