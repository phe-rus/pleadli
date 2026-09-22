import { Disclosure } from '@/components/disclosure'
import { Row, RowList } from '@/components/operational-row'
import { useConnectivityStatus } from '@/features/connectivity'
import { useInbox } from '@/features/notifications'
import { bucketOf, dueText, useObligationActions, type Obligation, type TodayView } from '@/features/obligations'
import { useClosedMonthReturn } from '@/features/reports'
import { usePermissions } from '@/features/session'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { m } from '@/paraglide/messages'
import { obligationEntries, systemEntries, type ObligationEntry, type SystemEntry } from './attention'

/** Not paired with any Head Office: a return has nobody to be sent to. */
const UNLINKED = ['not_connected', 'awaiting_approval', 'rejected', 'revoked', 'disconnected']

const toggleClass =
  'inline-flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-0.5 tabular-nums text-muted-foreground transition-colors duration-100 outline-none hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none'

function Chevron({ open }: { open: boolean }) {
  return <HugeiconsIcon icon={ArrowDown01Icon} className={cn('size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none', !open && '-rotate-90')} />
}

/**
 * What needs someone to act, as one list. The node keeps two things that ask
 * for action: obligations (a person's deadline) and the inbox (a message, or a
 * condition like an overdue backup). Here they read as one answer. Obligations
 * are grouped by kind and open to the people in them; the rest are single
 * lines. Something due on a later day waits under "Coming up" instead of
 * standing among what needs doing now.
 */
export function AttentionSection({ today, onSetupProfile }: { today: TodayView; onSetupProfile: () => void }) {
  const { can } = usePermissions()
  const { data: connection } = useConnectivityStatus()
  const { data: inbox } = useInbox()
  const linked = connection ? !UNLINKED.includes(connection.state) : false
  const canReadReports = can('report.read')
  const ret = useClosedMonthReturn(canReadReports, linked)
  const { action, drawers } = useObligationActions()

  const { needs, later } = useMemo(() => obligationEntries(today.obligations, today.now), [today.obligations, today.now])
  const monthName = ret.month ? format(ret.month.from, 'MMMM yyyy') : ''
  const reportId = ret.report?.id ?? null
  const system = useMemo(
    () =>
      systemEntries({
        visitsAwaitingDecision: today.care.visitsAwaitingDecision,
        facilityNamed: !!today.facility.name,
        onSetupProfile,
        monthlyReturn: canReadReports && !ret.loading && ret.month ? { stage: ret.stage, month: monthName, reportId } : null,
        inbox,
      }),
    [today.care.visitsAwaitingDecision, today.facility.name, onSetupProfile, canReadReports, ret.loading, ret.month, ret.stage, monthName, reportId, inbox],
  )

  const count = needs.length + system.length
  return (
    <section className="page-section" aria-labelledby="attention-heading">
      <div className="section-head">
        <h2 id="attention-heading">{m.attention_heading()}</h2>
        {count > 0 && <p>{m.attention_count({ count })}</p>}
      </div>

      {count === 0 ? (
        <p>{m.attention_nothing()}</p>
      ) : (
        <RowList>
          {needs.map((entry) => (
            <ObligationRow key={entry.key} entry={entry} now={today.now} action={action} />
          ))}
          {system.map((entry) => (
            <SystemRow key={entry.key} entry={entry} aligned />
          ))}
        </RowList>
      )}

      {later.length > 0 && <ComingUp entries={later} now={today.now} action={action} />}
      {drawers}
    </section>
  )
}

function ObligationRow({ entry, now, action, later }: { entry: ObligationEntry; now: number; action: (o: Obligation) => ReactNode; later?: boolean }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <Row
      marker={later ? undefined : entry.urgent ? 'urgent' : 'open'}
      aligned
      title={entry.title}
      summary={entry.summary}
      trailing={
        <>
          {entry.area && (
            <Link to={entry.area.to} className={buttonVariants({ size: 'xs', variant: 'secondary' })}>
              {entry.area.label}
            </Link>
          )}
          <button type="button" aria-expanded={open} aria-controls={panel} aria-label={open ? m.attention_hide_details() : m.attention_show_details()} onClick={() => setOpen(!open)} className={toggleClass}>
            {entry.items.length}
            <Chevron open={open} />
          </button>
        </>
      }
    >
      <Disclosure id={panel} open={open}>
        <div role="list" className="mb-3 ml-[0.4rem] flex flex-col divide-y divide-border/40 border-l border-border/60 pl-4">
          {entry.items.map((o) => (
            <div key={o.key} role="listitem" className="flex items-start gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong>{o.title}</strong>
                <p>
                  {o.prisonerId && o.prisonerName ? (
                    <Link to="/prisoners/$prisonerId" params={{ prisonerId: o.prisonerId }}>
                      {o.prisonerName}
                    </Link>
                  ) : (
                    o.prisonerName
                  )}
                  {o.detail ? ` · ${o.detail}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('tabular-nums text-muted-foreground', bucketOf(o, now) === 'overdue' && 'text-destructive')}>{dueText(o, now)}</span>
                {action(o)}
              </div>
            </div>
          ))}
        </div>
      </Disclosure>
    </Row>
  )
}

function SystemRow({ entry, aligned }: { entry: SystemEntry; aligned?: boolean }) {
  const navigate = useNavigate()
  const { action } = entry
  return (
    <Row
      marker="open"
      aligned={aligned}
      title={entry.title}
      summary={entry.summary}
      trailing={
        action && (
          <Button size="xs" variant="secondary" onClick={() => (action.run ? action.run() : action.to && void navigate(parseSearchRoute(action.to) as never))}>
            {action.label}
          </Button>
        )
      }
    />
  )
}

/** What is due on a later day: not needing action yet, and kept out of the way
 * until asked for. */
function ComingUp({ entries, now, action }: { entries: ObligationEntry[]; now: number; action: (o: Obligation) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  const total = entries.reduce((sum, entry) => sum + entry.items.length, 0)
  return (
    <div className="flex flex-col">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className={cn(toggleClass, 'w-fit -ml-1.5')}>
        <Chevron open={open} />
        {m.attention_coming_up({ count: total })}
      </button>
      <Disclosure id={panel} open={open}>
        <RowList className="mt-2">
          {entries.map((entry) => (
            <ObligationRow key={entry.key} entry={entry} now={now} action={action} later />
          ))}
        </RowList>
      </Disclosure>
    </div>
  )
}
