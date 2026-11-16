import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { bucketOf, dueText, type Obligation } from '@/features/obligations'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { m } from '@/paraglide/messages'

const DAY_MS = 86_400_000

/** How Today sorts what is owed: what cannot wait, who goes to court today,
 * who comes in and goes out, and everything else. A remand prisoner with no
 * court date cannot wait either: nobody else knows they are waiting (left to the attention list). */
export function splitDay(obligations: readonly Obligation[], now: number) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const endOfToday = start.getTime() + DAY_MS
  const cannotWait: Obligation[] = []
  const court: Obligation[] = []
  const inOut: Obligation[] = []
  const rest: Obligation[] = []
  for (const o of obligations) {
    const due = o.dueAt ?? Number.POSITIVE_INFINITY
    if (o.kind === 'no_court_date' || (o.kind === 'mandatory_bail' && due <= now) || (o.kind === 'discharge_due' && due < endOfToday) || (o.kind === 'court_date' && due < start.getTime())) {
      cannotWait.push(o)
    } else if (o.kind === 'court_date' && due < endOfToday) {
      court.push(o)
    } else if (['discharge_due', 'transfer_arrival', 'transfer_confirmation', 'hospital_return'].includes(o.kind)) {
      inOut.push(o)
    } else {
      rest.push(o)
    }
  }
  const byDue = (a: Obligation, b: Obligation) => (a.dueAt ?? 0) - (b.dueAt ?? 0)
  return { cannotWait: cannotWait.sort(byDue), court: court.sort(byDue), inOut: inOut.sort(byDue), rest }
}

/** One person's line: face and name (opening their file), what is owed and
 * when, and the one thing to do about it on the right. */
function PersonRow({ obligation, now, action, when }: { obligation: Obligation; now: number; action: ReactNode; when?: string }) {
  const name = obligation.prisonerName ?? obligation.title
  return (
    <GroupRow
      icon={obligation.prisonerId ? <PrisonerAvatar prisonerId={obligation.prisonerId} name={name} size={26} className="rounded-full" /> : undefined}
      label={
        obligation.prisonerId ? (
          <Link to="/prisoners/$prisonerId" params={{ prisonerId: obligation.prisonerId }} className="font-medium text-foreground no-underline hover:underline">
            {name}
          </Link>
        ) : (
          name
        )
      }
      detail={[obligation.title, when === undefined ? dueText(obligation, now, bucketOf(obligation, now)) : when].filter(Boolean).join(' · ')}
      value={action}
    />
  )
}

/** Only when something is late or due before tonight: the people past the
 * bail limit, due for release today, or back from court with no outcome. */
export function CannotWait({ obligations, now, action }: { obligations: Obligation[]; now: number; action: (o: Obligation) => ReactNode }) {
  if (obligations.length === 0) return null
  // One person, one row: everything that cannot wait about them on it.
  const people = new Map<string, Obligation[]>()
  for (const o of obligations) {
    const key = o.prisonerId ?? o.key
    people.set(key, [...(people.get(key) ?? []), o])
  }
  return (
    <section className="flex flex-col gap-1.5 rounded-xl bg-destructive/[0.06] p-1.5 ring-1 ring-destructive/25">
      <div className="flex flex-col px-2.5 pt-1.5">
        <h2 className="text-[0.9375rem] font-semibold text-destructive">{m.today_cannot_wait()}</h2>
        <p className="text-[0.8125rem] text-muted-foreground">{m.today_cannot_wait_note()}</p>
      </div>
      <Group>
        {[...people.values()].map((list) => {
          const first = list[0]
          const noDate = list.find((o) => o.kind === 'no_court_date')
          const reasons = list.map((o) => (o.kind === 'no_court_date' ? o.title : `${o.title} · ${dueText(o, now, bucketOf(o, now))}`))
          const held = noDate?.dueAt != null ? m.today_held_days({ days: Math.floor((now - noDate.dueAt) / DAY_MS) }) : undefined
          const merged: Obligation = { ...first, title: reasons.join(' · ') }
          const act =
            noDate && first.prisonerId ? (
              <Link to="/prisoners/$prisonerId" params={{ prisonerId: first.prisonerId }} className={buttonVariants({ size: 'xs', variant: 'secondary' })}>
                {m.file_add_court_date()}
              </Link>
            ) : (
              action(first)
            )
          return <PersonRow key={first.key} obligation={merged} now={now} action={act} when={held ?? ''} />
        })}
      </Group>
    </section>
  )
}

/** Today's court run: who is produced, to which court, at what time. */
export function CourtToday({ obligations, now, action }: { obligations: Obligation[]; now: number; action: (o: Obligation) => ReactNode }) {
  return (
    <Group
      title={m.today_court_today()}
      action={
        <Link to="/legal" className="text-[0.8125rem] no-underline">
          {m.today_open_court()}
        </Link>
      }
      footer={obligations.length === 0 ? m.today_court_none() : undefined}
    >
      {obligations.length > 0 ? (
        obligations.map((o) => <PersonRow key={o.key} obligation={o} now={now} action={action(o)} when={o.dueAt ? new Date(o.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined} />)
      ) : (
        <GroupRow label={<span className="text-muted-foreground">{m.today_court_nobody()}</span>} />
      )}
    </Group>
  )
}

/** Who leaves on release, arrives on transfer, or comes back from hospital. */
export function InAndOut({ obligations, now, action }: { obligations: Obligation[]; now: number; action: (o: Obligation) => ReactNode }) {
  if (obligations.length === 0) return null
  return (
    <Group title={m.today_in_and_out()}>
      {obligations.map((o) => (
        <PersonRow key={o.key} obligation={o} now={now} action={action(o)} />
      ))}
    </Group>
  )
}
