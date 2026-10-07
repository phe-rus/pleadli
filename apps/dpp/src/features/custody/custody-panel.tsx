import { useJurisdiction } from '@/features/installation'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { NewDocumentButton } from '@/features/templates/new-document'
import { formatDate, formatRelative } from '@/lib/dates'
import { packText } from '@/lib/jurisdiction'
import * as m from '@/paraglide/messages'
import { Add01Icon, AlertCircleIcon, Clock01Icon, Delete02Icon, SparklesIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CUSTODY_KINDS, type CustodyKind } from '@pleadli/setup'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { computeClocks, type Clock } from './clocks'
import { useAddCustody, useCustody, useDeleteCustody } from './queries'

export const custodyKindLabel = (kind: string) => {
  const k = CUSTODY_KINDS.find((x) => x.id === kind)
  return k ? packText(k.label) : kind
}

const tone: Record<Clock['status'], string> = {
  overdue: 'bg-destructive/10 text-destructive ring-destructive/30',
  late: 'bg-destructive/5 text-destructive ring-destructive/20',
  soon: 'bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300',
  running: 'bg-secondary/60 ring-border/60',
  met: 'bg-secondary/30 text-muted-foreground ring-border/40',
}

export function clockSentence(c: Clock) {
  switch (c.status) {
    case 'overdue':
      return m["clock.overdue"]({ when: formatRelative(c.dueAt), date: formatDate(c.dueAt, 'datetime') })
    case 'soon':
    case 'running':
      return m["clock.running"]({ when: formatRelative(c.dueAt), date: formatDate(c.dueAt, 'datetime') })
    case 'late':
      return m["clock.late"]({ date: formatDate(c.stoppedAt!, 'datetime') })
    default:
      return m["clock.met"]({ date: formatDate(c.stoppedAt!, 'datetime') })
  }
}

/** One line per legal clock, strongest warning first. */
export function ClockList({ clocks, compact = false }: { clocks: Clock[]; compact?: boolean }) {
  const order = { overdue: 0, soon: 1, late: 2, running: 3, met: 4 }
  return (
    <ul className="flex list-none flex-col gap-1.5 p-0">
      {[...clocks]
        .sort((a, b) => order[a.status] - order[b.status])
        .map((c, i) => (
          <li key={`${c.limit.id}-${c.person ?? ''}-${i}`} className={cn('flex items-start gap-3 rounded-xl px-3 py-2 ring-1', tone[c.status])}>
            <HugeiconsIcon icon={c.status === 'overdue' || c.status === 'late' ? AlertCircleIcon : c.status === 'met' ? Tick02Icon : Clock01Icon} className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <strong className="text-sm">
                {packText(c.limit.label)}
                {c.person ? ` · ${c.person}` : ''}
              </strong>
              <span className="text-sm">{clockSentence(c)}</span>
              {!compact && (
                <span className="text-xs opacity-75">
                  {m["clock.basis"]({ hours: c.limit.hours >= 72 ? m["clock.days"]({ n: c.limit.hours / 24 }) : m["clock.hours"]({ n: c.limit.hours }), basis: c.limit.basis, from: formatDate(c.startedAt, 'datetime') })}
                  {c.limit.source === 'S' ? ` ${m["clock.secondary"]()}` : ''}
                </span>
              )}
            </div>
          </li>
        ))}
    </ul>
  )
}

/** The custody record of a file and the clocks it starts. */
export function CustodyPanel({ fileId, quiet = false }: { fileId: string; quiet?: boolean }) {
  const country = useJurisdiction()
  const { data: events = [] } = useCustody(fileId)
  const add = useAddCustody()
  const remove = useDeleteCustody()
  const [open, setOpen] = useState(false)
  const kinds = [...new Set(country?.timeLimits.flatMap((l) => [...l.starts, ...l.stops]) ?? [])] as CustodyKind[]
  const [kind, setKind] = useState<CustodyKind>(kinds[0] ?? 'arrest')
  const [when, setWhen] = useState('')
  const [person, setPerson] = useState('')
  const clocks = computeClocks(events, country)

  if (!country?.timeLimits.length) return null
  // Nothing recorded yet: one quiet row that says so and offers the two ways in.
  if (quiet && events.length === 0 && !open)
    return (
      <Group>
        <GroupRow
          icon={
            <RowIcon tone="gray">
              <HugeiconsIcon icon={Clock01Icon} />
            </RowIcon>
          }
          label={m["clock.title"]()}
          detail={m["clock.none"]()}
          value={
            <>
              <NewDocumentButton fileId={fileId} decisionId={null} decisionKind={null} variant="ghost" mode="custody" />
              <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
                {m["clock.add_event"]()}
              </Button>
            </>
          }
        />
      </Group>
    )
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3>{m["clock.title"]()}</h3>
        <div className="flex items-center gap-1">
          <NewDocumentButton fileId={fileId} decisionId={null} decisionKind={null} variant="ghost" mode="custody" />
          {!open && (
            <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} />
              {m["clock.add_event"]()}
            </Button>
          )}
        </div>
      </div>
      {clocks.length > 0 ? <ClockList clocks={clocks} /> : <p className="text-muted-foreground">{m["clock.none"]()}</p>}

      {open && (
        <form
          className="grid gap-2 rounded-xl bg-secondary/40 p-3 sm:grid-cols-[1fr_12rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!when) return
            add.mutate({ prosecutionFileId: fileId, kind, at: new Date(when).getTime(), personName: person.trim() || null }, { onSuccess: () => { setOpen(false); setWhen('') } })
          }}
        >
          <select className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as CustodyKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {custodyKindLabel(k)}
              </option>
            ))}
          </select>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder={m["clock.person"]()} />
          <div className="flex gap-1">
            <Button size="sm" type="submit" disabled={!when || add.isPending}>
              {m["clock.save"]()}
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              {m["common.cancel"]()}
            </Button>
          </div>
        </form>
      )}

      {events.length > 0 && (
        <ol className="flex list-none flex-col gap-0.5 p-0 text-sm">
          {events.map((e) => (
            <li key={e.id} className="group/e flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-secondary/40">
              <span className="w-36 shrink-0 text-muted-foreground tabular-nums">{formatDate(e.at, 'datetime')}</span>
              <span className="min-w-0 flex-1 truncate">
                {custodyKindLabel(e.kind)}
                {e.personName ? ` · ${e.personName}` : ''}
              </span>
              {e.source === 'assist' && <HugeiconsIcon icon={SparklesIcon} className="size-3.5 text-primary" aria-label={m["index.placed_by_assist"]()} />}
              <button type="button" onClick={() => remove.mutate(e.id)} aria-label={m["court.remove"]()} className="cursor-pointer text-muted-foreground opacity-0 group-hover/e:opacity-100">
                <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
