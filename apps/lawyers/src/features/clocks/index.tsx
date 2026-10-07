import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag, type Tone } from '@/components/status-tag'
import { DateField } from '@/components/date-field'
import { api, messageOf, seg } from '@/lib/api'
import { formatDay, inDays } from '@/lib/dates'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import * as z from 'zod'

/** Deadlines, counted by the backend from what happened on a matter and the
 * country's rules (`domain/clocks.rs`). The screen only shows them. */

export const matterEventSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  kind: z.string(),
  onDay: z.number(),
  note: z.string().nullable(),
  recordedBy: z.string().nullable(),
  createdAt: z.number(),
})
export type MatterEvent = z.infer<typeof matterEventSchema>

export const clockSchema = z.object({
  rule: z.string(),
  matterId: z.string(),
  kind: z.enum(['deadline', 'earliest']),
  startedBy: z.string(),
  startedOn: z.number(),
  dueOn: z.number(),
  status: z.enum(['done', 'overdue', 'soon', 'running', 'waiting', 'ready']),
  daysLeft: z.number(),
  weekend: z.boolean(),
  cite: z.string(),
})
export type Clock = z.infer<typeof clockSchema>

export const matterClocksSchema = z.object({
  researched: z.boolean(),
  events: z.array(matterEventSchema),
  clocks: z.array(clockSchema),
  canRecord: z.array(z.string()),
})
export type MatterClocks = z.infer<typeof matterClocksSchema>

export const practiceClockSchema = clockSchema.extend({ matterTitle: z.string(), courtNumber: z.string().nullable() })
export type PracticeClock = z.infer<typeof practiceClockSchema>

export const practiceClocksOptions = () =>
  queryOptions({ queryKey: ['clocks'] as const, queryFn: async () => z.array(practiceClockSchema).parse(await api('GET', '/api/clocks')) })
export const usePracticeClocks = () => useQuery(practiceClocksOptions())

const recordEvent = async (matterId: string, input: { kind: string; onDay: number; note: string | null }) =>
  matterEventSchema.parse(await api('POST', `/api/matters/${seg(matterId)}/events`, { body: input }))
export const useRecordEvent = () => useMutation({ mutationFn: (v: { matterId: string; input: { kind: string; onDay: number; note: string | null } }) => recordEvent(v.matterId, v.input) })
export const useRemoveEvent = () => useMutation({ mutationFn: (id: string) => api('DELETE', `/api/events/${seg(id)}`) })

const eventLabels: Record<string, () => string> = {
  summons_issued: () => m["event.summons_issued"](),
  summons_served: () => m["event.summons_served"](),
  served_with_summons: () => m["event.served_with_summons"](),
  defence_filed: () => m["event.defence_filed"](),
  defence_received: () => m["event.defence_received"](),
  reply_filed: () => m["event.reply_filed"](),
  counterclaim_received: () => m["event.counterclaim_received"](),
  directions_taken_out: () => m["event.directions_taken_out"](),
  adr_ordered: () => m["event.adr_ordered"](),
  adr_completed: () => m["event.adr_completed"](),
  application_served_on_us: () => m["event.application_served_on_us"](),
  application_reply_filed: () => m["event.application_reply_filed"](),
  decision_delivered: () => m["event.decision_delivered"](),
  notice_of_appeal_lodged: () => m["event.notice_of_appeal_lodged"](),
  memorandum_lodged: () => m["event.memorandum_lodged"](),
  government_notice_served: () => m["event.government_notice_served"](),
  suit_filed: () => m["event.suit_filed"](),
  cause_of_action_contract: () => m["event.cause_of_action_contract"](),
  cause_of_action_tort: () => m["event.cause_of_action_tort"](),
  cause_of_action_injury: () => m["event.cause_of_action_injury"](),
  cause_of_action_land: () => m["event.cause_of_action_land"](),
  judgment_enforceable: () => m["event.judgment_enforceable"](),
  execution_started: () => m["event.execution_started"](),
  appearance_entered: () => m["event.appearance_entered"](),
  pleadings_closed: () => m["event.pleadings_closed"](),
  checklist_filed: () => m["event.checklist_filed"](),
}
export const eventLabel = (kind: string) => eventLabels[kind]?.() ?? kind

const ruleLabels: Record<string, () => string> = {
  serve_summons: () => m["clock.serve_summons"](),
  summons_validity: () => m["clock.summons_validity"](),
  case_management_checklist: () => m["clock.case_management_checklist"](),
  notice_to_government_30: () => m["clock.notice_to_government_30"](),
  notice_to_government_90: () => m["clock.notice_to_government_90"](),
  file_defence: () => m["clock.file_defence"](),
  reply_to_defence: () => m["clock.reply_to_defence"](),
  reply_to_counterclaim: () => m["clock.reply_to_counterclaim"](),
  summons_for_directions: () => m["clock.summons_for_directions"](),
  complete_adr: () => m["clock.complete_adr"](),
  reply_to_application: () => m["clock.reply_to_application"](),
  notice_of_appeal: () => m["clock.notice_of_appeal"](),
  criminal_notice_of_appeal: () => m["clock.notice_of_appeal"](),
  memorandum_of_appeal: () => m["clock.memorandum_of_appeal"](),
  notice_to_government: () => m["clock.notice_to_government"](),
  limitation_contract: () => m["clock.limitation"](),
  limitation_tort: () => m["clock.limitation"](),
  limitation_injury: () => m["clock.limitation"](),
  limitation_land: () => m["clock.limitation"](),
  limitation_government_contract: () => m["clock.limitation"](),
  limitation_government_tort: () => m["clock.limitation"](),
  limitation_government_injury: () => m["clock.limitation"](),
  enforce_judgment: () => m["clock.enforce_judgment"](),
}
export const clockLabel = (rule: string) => ruleLabels[rule]?.() ?? rule

const statusTone: Record<Clock['status'], Tone> = { done: 'done', overdue: 'urgent', soon: 'waiting', running: 'open', waiting: 'neutral', ready: 'open' }
const statusText = (c: Clock) =>
  ({
    done: () => m["clock.status.done"](),
    overdue: () => m["clock.status.overdue"]({ when: inDays(c.daysLeft) }),
    soon: () => m["clock.status.soon"]({ when: inDays(c.daysLeft) }),
    running: () => m["clock.status.running"]({ when: inDays(c.daysLeft) }),
    waiting: () => m["clock.status.waiting"]({ when: inDays(c.daysLeft) }),
    ready: () => m["clock.status.ready"](),
  })[c.status]()

export function ClockTag({ clock }: { clock: Clock }) {
  return <Tag tone={statusTone[clock.status]}>{statusText(clock)}</Tag>
}

/** One line for a clock: what is due and by when, and why. */
function clockSummary(c: Clock) {
  const by = c.kind === 'earliest' ? m["clock.not_before"]({ day: formatDay(c.dueOn) }) : m["clock.by"]({ day: formatDay(c.dueOn) })
  const from = m["clock.from"]({ event: eventLabel(c.startedBy).toLowerCase(), day: formatDay(c.startedOn) })
  return [by, from, c.cite, c.weekend ? m["clock.weekend"]() : null].filter(Boolean).join(' · ')
}

/** A matter's deadlines, and the one place its steps are recorded. */
export function DeadlinesSection({ matterId, open, clocks }: { matterId: string; open: boolean; clocks: MatterClocks }) {
  const record = useRecordEvent()
  const remove = useRemoveEvent()
  const [kind, setKind] = useState(clocks.canRecord[0] ?? '')
  const [day, setDay] = useState(toIsoDay(Date.now()))
  const [note, setNote] = useState('')

  if (!clocks.researched) {
    return (
      <section aria-labelledby="deadlines" className="page-section">
        <h2 id="deadlines">{m["clock.title"]()}</h2>
        <EmptyNote>{m["clock.not_researched"]()}</EmptyNote>
      </section>
    )
  }
  if (clocks.canRecord.length === 0) return null

  return (
    <section aria-labelledby="deadlines" className="page-section">
      <div className="section-head">
        <h2 id="deadlines">{m["clock.title"]()}</h2>
      </div>
      {clocks.clocks.length === 0 ? (
        <EmptyNote>{m["clock.none"]()}</EmptyNote>
      ) : (
        <RowList>
          {clocks.clocks.map((c) => (
            <Row key={c.rule} aligned marker={c.status === 'overdue' ? 'urgent' : c.status === 'soon' ? 'open' : undefined} title={clockLabel(c.rule)} summary={clockSummary(c)} trailing={<ClockTag clock={c} />} />
          ))}
        </RowList>
      )}

      {open && (
        <form
          className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const onDay = fromDateInput(day)
            if (!onDay || !kind) return
            record.mutate(
              { matterId, input: { kind, onDay, note: note.trim() || null } },
              {
                onSuccess: () => {
                  t.success(m["event.recorded"]({ event: eventLabel(kind) }))
                  setNote('')
                },
                onError: (error) => t.error(m["event.record_failed"](), { description: messageOf(error) }),
              },
            )
          }}
        >
          <strong>{m["event.record_title"]()}</strong>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Select items={clocks.canRecord.map((k) => ({ value: k, label: eventLabel(k) }))} value={kind} onValueChange={(v) => v && setKind(v)}>
              <SelectTrigger aria-label={m["event.what"]()} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clocks.canRecord.map((k) => (
                    <SelectItem key={k} value={k}>
                      {eventLabel(k)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <DateField label={m["event.on"]()} value={day} onChange={setDay} />
          </div>
          <Input aria-label={m["event.note"]()} placeholder={m["event.note"]()} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!kind || record.isPending}>
              {m["event.record"]()}
            </Button>
          </div>
        </form>
      )}

      {clocks.events.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{m["event.history"]({ count: clocks.events.length })}</summary>
          <RowList>
            {[...clocks.events].reverse().map((e) => (
              <Row
                key={e.id}
                aligned
                title={eventLabel(e.kind)}
                summary={[formatDay(e.onDay), e.note, e.recordedBy].filter(Boolean).join(' · ')}
                trailing={
                  open && (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id, { onError: (error) => t.error(m["event.remove_failed"](), { description: messageOf(error) }) })}>
                      {m["party.remove"]()}
                    </Button>
                  )
                }
              />
            ))}
          </RowList>
        </details>
      )}
    </section>
  )
}

/** Today: every running deadline across the practice, most urgent first. */
export function PracticeDeadlines() {
  const { data: clocks } = usePracticeClocks()
  if (!clocks || clocks.length === 0) return null
  const pressing = clocks.filter((c) => c.status === 'overdue' || c.status === 'soon' || c.status === 'ready')
  const shown = (pressing.length ? pressing : clocks).slice(0, 8)
  return (
    <section aria-labelledby="practice-deadlines" className="page-section">
      <div className="section-head">
        <h2 id="practice-deadlines">{m["clock.today_title"]()}</h2>
        <Tag tone={pressing.some((c) => c.status === 'overdue') ? 'urgent' : 'neutral'}>{m["clock.count"]({ count: clocks.length })}</Tag>
      </div>
      <RowList>
        {shown.map((c) => (
          <Row
            key={`${c.matterId}-${c.rule}`}
            aligned
            marker={c.status === 'overdue' ? 'urgent' : c.status === 'soon' ? 'open' : undefined}
            title={
              <Link to="/matters/$matterId" params={{ matterId: c.matterId }} className="text-foreground">
                {clockLabel(c.rule)}, {c.courtNumber ?? c.matterTitle}
              </Link>
            }
            summary={clockSummary(c)}
            trailing={<ClockTag clock={c} />}
          />
        ))}
      </RowList>
    </section>
  )
}
