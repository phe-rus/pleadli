import { ChoiceSelect } from '@/components/choice-select'
import { formatDate } from '@/lib/dates'
import { useJurisdiction } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { t } from '@pleadli/ui/goey-toaster'
import { useClocks } from '@/features/clocks'
import { LinkedFiles } from '@/features/prosecution-files/linked-files'
import { adjournmentCauses, useMinutes, useSaveMinute, useSendMinute, type AdjournmentCause, type Minute, type Witness } from './minutes'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useId, useState } from 'react'
import { CountedTabs } from '@pleadli/shell'
import { hearingKinds, type Hearing, type HearingKind } from './data'
import { useCreateFiling, useDeleteFiling, useDeleteHearing, useFilings, useHearings, useSaveHearing } from './queries'

export const hearingKindLabel = (kind: string) =>
  (
    ({
      mention: m["court.kind.mention"],
      plea: m["court.kind.plea"],
      bail: m["court.kind.bail"],
      hearing: m["court.kind.hearing"],
      trial: m["court.kind.trial"],
      ruling: m["court.kind.ruling"],
      judgment: m["court.kind.judgment"],
      sentence: m["court.kind.sentence"],
      other: m["court.kind.other"],
    }) as Record<string, () => string>
  )[kind]?.() ?? kind

const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

/** The country's courts, offered as suggestions while typing a court. */
function CourtSuggestions({ id }: { id: string }) {
  const country = useJurisdiction()
  return (
    <datalist id={id}>
      {country?.courts.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  )
}

function HearingForm({ fileId, lastCourt, onDone }: { fileId: string; lastCourt?: string; onDone: () => void }) {
  const list = useId()
  const [court, setCourt] = useState(lastCourt ?? '')
  const [kind, setKind] = useState<HearingKind>('mention')
  const [day, setDay] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const save = useSaveHearing()
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!court.trim() || !day) return
        save.mutate(
          { input: { prosecutionFileId: fileId, court: court.trim(), kind, startsAt: new Date(`${day}T${time || '09:00'}:00`).getTime(), note: note.trim() || null } },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.court"]()}</span>
          <Input list={list} value={court} onChange={(e) => setCourt(e.target.value)} autoFocus />
          <CourtSuggestions id={list} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.what"]()}</span>
          <ChoiceSelect className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as HearingKind)}>
            {hearingKinds.map((k) => (
              <option key={k} value={k}>
                {hearingKindLabel(k)}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.date"]()}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.time"]()}</span>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <Input placeholder={m["court.note_placeholder"]()} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!court.trim() || !day || save.isPending}>
          {m["court.add_hearing"]()}
        </Button>
      </div>
    </form>
  )
}

function FilingForm({ fileId, lastCourt, onDone }: { fileId: string; lastCourt?: string; onDone: () => void }) {
  const list = useId()
  const [what, setWhat] = useState('')
  const [court, setCourt] = useState(lastCourt ?? '')
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState('')
  const create = useCreateFiling()
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!what.trim() || !court.trim()) return
        create.mutate({ prosecutionFileId: fileId, what: what.trim(), court: court.trim(), filedAt: new Date(`${day}T12:00:00`).getTime(), receipt: receipt.trim() || null }, { onSuccess: onDone })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.filed_what"]()}</span>
          <Input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={m["court.filed_what_placeholder"]()} autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.court"]()}</span>
          <Input list={list} value={court} onChange={(e) => setCourt(e.target.value)} />
          <CourtSuggestions id={list} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.filed_on"]()}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.receipt"]()}</span>
          <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder={m["court.receipt_placeholder"]()} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!what.trim() || !court.trim() || create.isPending}>
          {m["court.add_filing"]()}
        </Button>
      </div>
    </form>
  )
}

const outcomes = ['held', 'adjourned', 'plea_taken', 'ruling', 'judgment', 'bail_ruled'] as const
type Outcome = (typeof outcomes)[number]
const outcomeWord = (o: Outcome) => m[`court.outcome.${o}`]()
const causeWord = (c: string) => (adjournmentCauses as readonly string[]).includes(c) ? m[`court.cause.${c as AdjournmentCause}`]() : c

const card = 'flex flex-col gap-3 rounded-2xl p-5 ring-1 ring-border/70'
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The witnesses for one hearing and whether each has been served: the
 * summons names the courtroom and time, and an unserved witness is the
 * commonest reason a hearing is lost. */
function Witnesses({ fileId, hearing, minute }: { fileId: string; hearing: Hearing; minute?: Minute }) {
  const save = useSaveMinute(fileId)
  const send = useSendMinute(fileId)
  const [rows, setRows] = useState<Witness[]>(minute?.witnesses ?? [])
  const [name, setName] = useState('')
  useEffect(() => setRows(minute?.witnesses ?? []), [minute])
  const dirty = JSON.stringify(rows) !== JSON.stringify(minute?.witnesses ?? [])
  const missing = rows.filter((w) => !w.served).length
  const patch = (i: number, p: Partial<Witness>) => setRows(rows.map((w, j) => (j === i ? { ...w, ...p } : w)))
  return (
    <div className={cn(card, 'flex-[1.4_1_22rem]')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{m["court.witnesses"]()}</h3>
        {missing > 0 && <span className="text-sm text-muted-foreground">{m["court.not_served_count"]({ count: missing })}</span>}
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{m["court.witnesses_none"]()}</p>}
      {rows.map((w, i) => (
        <div key={i} className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium">{w.witness}</span>
            {!w.served && <Input value={w.reason ?? ''} onChange={(e) => patch(i, { reason: e.target.value })} placeholder={m["court.not_served_why"]()} className="h-8" />}
          </div>
          <button
            type="button"
            onClick={() => patch(i, { served: !w.served, reason: w.served ? w.reason : null })}
            className={cn('cursor-pointer rounded-full px-3 py-1 text-xs font-semibold', w.served ? 'bg-[#e8f3ec] text-[#14532d] dark:bg-[#14532d]/40 dark:text-[#d6efdc]' : 'bg-[#fff1e6] text-[#9a3a00] dark:bg-[#9a3a00]/30 dark:text-[#ffd9b8]')}
          >
            {w.served ? m["court.served"]() : m["court.not_served"]()}
          </button>
          <Button size="icon-sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={m["court.remove"]()}>
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          setRows([...rows, { witness: name.trim(), served: false, reason: null }])
          setName('')
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={m["court.witness_name"]()} className="h-9" />
        <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()}>
          <HugeiconsIcon icon={Add01Icon} />
          {m["court.witness_add"]()}
        </Button>
      </form>
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { hearingId: hearing.id, input: { nextDate: minute?.nextDate ?? null, adjournmentCause: minute?.adjournmentCause ?? null, exhibits: minute?.exhibits ?? [], note: minute?.note ?? null, witnesses: rows } },
                { onError: (e) => t.error(m["court.witness_save"](), { description: e.message }) },
              )
            }
          >
            {m["court.witness_save"]()}
          </Button>
        </div>
      )}
      {!dirty && minute && (
        <div className="flex items-center justify-end gap-3">
          {minute.sentAt ? <span className="text-sm text-muted-foreground">{m["court.minute_sent"]({ date: formatDate(minute.sentAt) })}</span> : null}
          <Button
            size="sm"
            variant={minute.sentAt ? "secondary" : "default"}
            disabled={send.isPending}
            onClick={() => send.mutate(hearing.id, { onSuccess: () => t.success(m["court.minute_prepared"]()), onError: (e) => t.error(m["court.minute_send"](), { description: e.message }) })}
          >
            {minute.sentAt ? m["court.minute_send_again"]() : m["court.minute_send"]()}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Exhibits, and how the last hearing ended: what to know before walking in. */
function WalkIn({ fileId, next, nextMinute, last, lastMinute }: { fileId: string; next?: Hearing; nextMinute?: Minute; last?: Hearing; lastMinute?: Minute }) {
  const save = useSaveMinute(fileId)
  const [text, setText] = useState((nextMinute?.exhibits ?? []).join('\n'))
  useEffect(() => setText((nextMinute?.exhibits ?? []).join('\n')), [nextMinute])
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className={cn(card, 'bg-card')}>
      <h3 className="text-base font-semibold">{m["court.walk_in"]()}</h3>
      {next && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.exhibits"]()}</span>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-16"
            onBlur={() =>
              JSON.stringify(lines) !== JSON.stringify(nextMinute?.exhibits ?? []) &&
              save.mutate({ hearingId: next.id, input: { nextDate: nextMinute?.nextDate ?? null, adjournmentCause: nextMinute?.adjournmentCause ?? null, exhibits: lines, note: nextMinute?.note ?? null, witnesses: nextMinute?.witnesses ?? [] } })
            }
          />
        </label>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        <b className="font-semibold text-foreground">{m["court.last_time"]()}:</b>{' '}
        {last
          ? [last.outcome ?? hearingKindLabel(last.kind), lastMinute?.adjournmentCause ? `(${m["court.caused_by"]({ who: causeWord(lastMinute.adjournmentCause).toLowerCase() })})` : ''].filter(Boolean).join(' ')
          : m["court.last_time_none"]()}
      </p>
    </div>
  )
}

/** After the hearing: pick what the court did, the next date and who caused an
 * adjournment. Writes the outcome, the minute for Police, and the next hearing
 * into the diary in one step. */
function AfterHearing({ fileId, target, minute }: { fileId: string; target?: Hearing; minute?: Minute }) {
  const saveHearing = useSaveHearing()
  const saveMinute = useSaveMinute(fileId)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [next, setNext] = useState('')
  const [cause, setCause] = useState<AdjournmentCause>('prosecution')
  const [note, setNote] = useState('')
  const adjourned = outcome === 'adjourned'
  useEffect(() => {
    setOutcome(null)
    setNext('')
    setNote(minute?.note ?? '')
  }, [target?.id])

  const submit = async () => {
    if (!target || !outcome) return
    const at = new Date(target.startsAt)
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    const when = next ? new Date(`${next}T${clock}:00`).getTime() : null
    try {
      await saveHearing.mutateAsync({
        id: target.id,
        input: { prosecutionFileId: fileId, court: target.court, kind: target.kind, startsAt: target.startsAt, note: target.note, outcome: adjourned && next ? `${outcomeWord(outcome)}: ${formatDate(new Date(`${next}T12:00:00`))}` : outcomeWord(outcome) },
      })
      await saveMinute.mutateAsync({
        hearingId: target.id,
        input: { nextDate: when && !Number.isNaN(when) ? when : null, adjournmentCause: adjourned ? cause : null, exhibits: minute?.exhibits ?? [], note: note.trim() || null, witnesses: minute?.witnesses ?? [] },
      })
      if (next && when && !Number.isNaN(when)) {
        await saveHearing.mutateAsync({ input: { prosecutionFileId: fileId, court: target.court, kind: target.kind, startsAt: when, note: null } })
      }
      t.success(m["court.save_record"]())
      setOutcome(null)
      setNext('')
    } catch (e) {
      t.error(m["court.save_record"](), { description: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className={cn(card, 'bg-card')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{m["court.after"]()}</h3>
        {target && <span className="text-sm text-muted-foreground">{m["court.recording"]({ kind: hearingKindLabel(target.kind).toLowerCase(), date: formatDate(target.startsAt) })}</span>}
      </div>
      {!target ? (
        <p className="text-sm text-muted-foreground">{m["court.after_none"]()}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={cn('cursor-pointer rounded-xl px-3.5 py-2 text-sm', outcome === o ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/70')}
              >
                {outcomeWord(o)}
              </button>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{m["court.after_about"]()}</p>
          {outcome && (
            <div className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{m["court.next_date"]()}</span>
                  <Input type="date" value={next} min={day(target.startsAt)} onChange={(e) => setNext(e.target.value)} />
                </label>
                {adjourned && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{m["court.cause.label"]()}</span>
                    <ChoiceSelect className={selectClass} value={cause} onChange={(e) => setCause(e.target.value as AdjournmentCause)}>
                      {adjournmentCauses.map((c) => (
                        <option key={c} value={c}>
                          {m[`court.cause.${c}`]()}
                        </option>
                      ))}
                    </ChoiceSelect>
                  </label>
                )}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={m["court.note_file"]()} className="min-h-16" />
              <div className="flex justify-end">
                <Button size="sm" disabled={saveHearing.isPending || saveMinute.isPending} onClick={() => void submit()}>
                  {m["court.save_record"]()}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** A file's life in court, laid out like the canvas board: the next hearing
 * first, then who must be there, what to know before walking in, how to record
 * the day, and on the right the same matter in other files and what happened. */
export function CourtRecord({ fileId }: { fileId: string }) {
  const { data: hearings = [] } = useHearings(fileId)
  const { data: filings = [] } = useFilings(fileId)
  const { data: minutes = [] } = useMinutes(fileId)
  const { data: clocks = [] } = useClocks()
  const removeHearing = useDeleteHearing()
  const removeFiling = useDeleteFiling()
  const [adding, setAdding] = useState<'hearing' | 'filing' | null>(null)
  const [recordOpen, setRecordOpen] = useState(0)

  const minuteOf = (h?: Hearing) => (h ? minutes.find((x) => x.hearingId === h.id) : undefined)
  const now = Date.now()
  const endOfToday = new Date().setHours(23, 59, 59, 999)
  const upcoming = hearings.filter((h) => h.startsAt >= now - 12 * 3_600_000 && !h.outcome)
  const next = upcoming[0]
  const done = hearings.filter((h) => h.outcome).sort((a, b) => b.startsAt - a.startsAt)
  const last = done[0]
  // What the recorder is about: the latest hearing that has come, with no outcome yet.
  const target = [...hearings].filter((h) => !h.outcome && h.startsAt <= endOfToday).sort((a, b) => b.startsAt - a.startsAt)[0]
  const review = clocks.find((c: { fileId: string; kind: string }) => c.fileId === fileId && c.kind === 'adjournment_review')
  const lastCourt = hearings[hearings.length - 1]?.court ?? filings[0]?.court
  const timeline = [...hearings].filter((h) => h.outcome).sort((a, b) => b.startsAt - a.startsAt)

  const hearingTab = (
    <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/25">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-primary">{m["court.next_hearing"]().toUpperCase()}</span>
            {next ? (
              <>
                <span className="text-2xl font-semibold">{formatDate(next.startsAt, 'weekday')}, {formatDate(next.startsAt, 'time')}</span>
                <span className="text-sm text-muted-foreground">{[next.court, hearingKindLabel(next.kind), next.note].filter(Boolean).join(' · ')}</span>
              </>
            ) : (
              <span className="text-lg text-muted-foreground">{m["court.no_next"]()}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!target} onClick={() => setRecordOpen((n) => n + 1)}>
              {m["court.record_what"]()}
            </Button>
            {adding !== 'hearing' && (
              <Button size="sm" variant="secondary" onClick={() => setAdding('hearing')}>
                <HugeiconsIcon icon={Add01Icon} />
                {m["court.add_hearing"]()}
              </Button>
            )}
          </div>
        </div>
        {adding === 'hearing' && <HearingForm fileId={fileId} lastCourt={lastCourt} onDone={() => setAdding(null)} />}

        <div className="flex flex-wrap items-stretch gap-5">
          {next ? <Witnesses key={next.id} fileId={fileId} hearing={next} minute={minuteOf(next)} /> : null}
          <div className="flex min-w-[min(100%,17rem)] flex-1 flex-col gap-5">
            <WalkIn key={next?.id ?? 'none'} fileId={fileId} next={next} nextMinute={minuteOf(next)} last={last} lastMinute={minuteOf(last)} />
            {review && (
              <div className={cn(card, 'bg-[#fff7f0] ring-[#f4d9c3] dark:bg-[#9a3a00]/15 dark:ring-[#9a3a00]/40')}>
                <h3 className="text-[15px] font-semibold text-[#7a2e00] dark:text-[#ffd9b8]">{m["court.adjourn_warn"]({ count: review.count ?? 0 })}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{m["court.adjourn_warn_about"]()}</p>
              </div>
            )}
          </div>
        </div>

        <div key={recordOpen}>
          <AfterHearing fileId={fileId} target={target} minute={minuteOf(target)} />
        </div>


    </div>
  )
  const hearingsTab = (
    <div className="flex flex-col gap-5">
        <section className={cn(card, 'bg-card')}>
          {hearings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m["court.no_hearings"]()}</p>
          ) : (
            <ol className="flex list-none flex-col divide-y divide-border/60 p-0">
              {[...hearings].sort((a, b) => b.startsAt - a.startsAt).map((h) => (
                <li key={h.id} className="group/h flex items-center gap-3 py-2">
                  <span className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">{formatDate(h.startsAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <strong className="font-medium">{hearingKindLabel(h.kind)}</strong> <span className="text-muted-foreground">{h.court}{h.outcome ? `. ${h.outcome}` : ''}</span>
                  </span>
                  <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover/h:opacity-100" onClick={() => removeHearing.mutate(h.id)} aria-label={m["court.remove"]()}>
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </section>


    </div>
  )
  const filingsTab = (
    <div className="flex flex-col gap-5">
        <section className={cn(card, 'bg-card')}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{m["court.filings"]()}</h3>
            {adding !== 'filing' && (
              <Button size="sm" variant="secondary" onClick={() => setAdding('filing')}>
                <HugeiconsIcon icon={Add01Icon} />
                {m["court.add_filing"]()}
              </Button>
            )}
          </div>
          {adding === 'filing' && <FilingForm fileId={fileId} lastCourt={lastCourt} onDone={() => setAdding(null)} />}
          {filings.length === 0 && adding !== 'filing' ? (
            <p className="text-sm text-muted-foreground">{m["court.no_filings"]()}</p>
          ) : (
            <div role="list" className="flex flex-col divide-y divide-border/60">
              {filings.map((f) => (
                <div key={f.id} role="listitem" className="group/f flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{f.what}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {f.court}, {formatDate(f.filedAt)}
                      {f.receipt ? `. ${m["court.receipt"]()}: ${f.receipt}` : ''}
                    </span>
                  </div>
                  <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover/f:opacity-100" onClick={() => removeFiling.mutate(f.id)} aria-label={m["court.remove"]()}>
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

    </div>
  )
  const timelineTab = (
        <div className="flex flex-col gap-3">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m["court.nothing_yet"]()}</p>
          ) : (
            timeline.map((h) => {
              const mi = minuteOf(h)
              return (
                <div key={h.id} className="flex gap-3 text-sm leading-snug">
                  <i aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-border" />
                  <span>
                    <b className="font-semibold">{formatDate(h.startsAt, 'date')}</b> {hearingKindLabel(h.kind)}. {h.outcome}
                    {mi?.adjournmentCause ? `, ${m["court.caused_by"]({ who: causeWord(mi.adjournmentCause).toLowerCase() })}` : ''}.
                  </span>
                </div>
              )
            })
          )}
        </div>

  )

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-[min(100%,26rem)] flex-[999_1_34rem] flex-col gap-5">
        <CountedTabs
          tabs={[
            { id: 'next', label: m["court.next_hearing"](), content: hearingTab },
            { id: 'hearings', label: m["court.all_hearings"](), count: hearings.length, content: hearingsTab },
            { id: 'filings', label: m["court.filings"](), count: filings.length, content: filingsTab },
            { id: 'happened', label: m["court.what_happened"](), count: timeline.length, content: timelineTab },
          ]}
        />
      </div>

      <aside className="flex min-w-[min(100%,16rem)] flex-[1_1_18rem] flex-col gap-5 rounded-2xl bg-secondary/40 p-5 lg:max-w-80">
        <LinkedFiles fileId={fileId} />
      </aside>
    </div>
  )
}
