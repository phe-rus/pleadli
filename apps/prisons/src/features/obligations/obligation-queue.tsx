import { CourtOutcomeForm } from '@/features/court-productions'
import { ResolveObligationForm } from './resolve-obligation-form'
import { bucketLabels, bucketOf, type Bucket, type Obligation } from './schema'
import { Createpanel } from '@/components/create-panel'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

const DAY_MS = 86_400_000

function dueText(obligation: Obligation, bucket: Bucket, now: number) {
  if (obligation.dueAt == null) return m.obligations_awaiting()
  if (bucket === 'overdue') {
    const days = Math.max(1, Math.floor((now - obligation.dueAt) / DAY_MS))
    return `${days} day${days === 1 ? '' : 's'} overdue`
  }
  if (bucket === 'today') return `Today ${format(obligation.dueAt, 'p')}`
  return format(obligation.dueAt, 'EEE d MMM')
}

type ObligationQueueProps = {
  obligations: readonly Obligation[]
  now: number
  emptyMessage: string
  /** Hide the section headings, for a short list such as exceptions. */
  flat?: boolean
}

/**
 * A queue where every row opens the procedure that discharges it
 * (docs/prisons/product-map/08 1.3). Court outcomes and threshold actions are
 * recorded in a drawer on the spot; everything else opens its page.
 */
export function ObligationQueue({ obligations, now, emptyMessage, flat }: ObligationQueueProps) {
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null)
  const [outcomeDirty, setOutcomeDirty] = useState(false)
  const [resolving, setResolving] = useState<Obligation | null>(null)
  const [resolveDirty, setResolveDirty] = useState(false)

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
                      {dueText(o, bucket, now)}
                    </Badge>
                    <RowAction obligation={o} onOutcome={() => setOutcomeFor(o.procedure?.id ?? null)} onResolve={() => setResolving(o)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Createpanel
        open={outcomeFor != null}
        onOpenChange={(open) => !open && setOutcomeFor(null)}
        isDirty={outcomeDirty}
        headings={{ title: m.obligations_record_the_court_outcome(), description: m.obligations_what_the_court_decided_at_this() }}
      >
        {outcomeFor && <CourtOutcomeForm productionId={outcomeFor} onSuccess={() => setOutcomeFor(null)} onDirtyChange={setOutcomeDirty} />}
      </Createpanel>

      <Createpanel
        open={resolving != null}
        onOpenChange={(open) => !open && setResolving(null)}
        isDirty={resolveDirty}
        headings={{ title: m.obligations_record_the_action_taken(), description: m.obligations_closes_this_item_with_what_was() }}
      >
        {resolving && <ResolveObligationForm obligation={resolving} onSuccess={() => setResolving(null)} onDirtyChange={setResolveDirty} />}
      </Createpanel>
    </>
  )
}

function RowAction({ obligation, onOutcome, onResolve }: { obligation: Obligation; onOutcome: () => void; onResolve: () => void }) {
  const small = buttonVariants({ size: 'xs', variant: 'secondary' })
  const p = obligation.procedure

  if (obligation.resolvable) {
    return (
      <Button size="xs" variant="secondary" onClick={onResolve}>
        {m.obligations_record_action()}
      </Button>
    )
  }
  if (!p) return null

  switch (p.kind) {
    case 'discharge':
      return p.id ? (
        <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId: p.id }} className={small}>
          {m.obligations_discharge()}
        </Link>
      ) : null
    case 'court_outcome':
      return (
        <Button size="xs" variant="secondary" onClick={onOutcome}>
          {m.obligations_record_outcome()}
        </Button>
      )
    case 'transfer_arrival':
      return p.id ? (
        <Link to="/procedures/arrival/$transferId" params={{ transferId: p.id }} className={small}>
          {m.obligations_confirm_arrival()}
        </Link>
      ) : null
    case 'transfer_confirm':
      return (
        <Link to="/movements" className={small}>
          {m.obligations_open_movements()}
        </Link>
      )
    case 'instrument':
    case 'sentence':
    case 'regularise':
    case 'hospital_return':
    case 'file':
      return p.id ? (
        <Link to="/prisoners/$prisonerId" params={{ prisonerId: p.id }} className={small}>
          {m.obligations_open_file()}
        </Link>
      ) : null
    default:
      return null
  }
}
