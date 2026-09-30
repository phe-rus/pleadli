import { DateField } from '@/components/date-field'
import { installationOptions } from '@/features/installation'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  feeNotesOptions,
  parseShillings,
  ugx,
  unbilledTimeOptions,
  useCreateFeeNote,
  useIssueFeeNote,
  useRecordEntry,
  useUpdateFeeNote,
  type EntryKind,
  type FeeNote,
} from './data'

export const entryKindLabel = (kind: string) =>
  ({
    received: m["money.kind.received"],
    paid_out: m["money.kind.paid_out"],
    to_office: m["money.kind.to_office"],
    fee_received: m["money.kind.fee_received"],
    disbursement: m["money.kind.disbursement"],
  })[kind as EntryKind]?.() ?? kind

const entryAbout = (kind: EntryKind) =>
  ({
    received: m["money.about.received"],
    paid_out: m["money.about.paid_out"],
    to_office: m["money.about.to_office"],
    fee_received: m["money.about.fee_received"],
    disbursement: m["money.about.disbursement"],
  })[kind]()

function Refusal({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
      {text}
    </p>
  ) : null
}

/** One entry in the books. The kinds offered are the ones that make sense
 * where it is opened; the backend refuses what the Accounts Rules forbid, and
 * the refusal is shown here as it is. */
export function EntryForm({ clientId, matterId, kinds, feeNoteId, onDone }: { clientId: string; matterId: string | null; kinds: readonly EntryKind[]; feeNoteId?: string; onDone: () => void }) {
  const record = useRecordEntry()
  const [kind, setKind] = useState<EntryKind>(kinds[0])
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(toIsoDay(Date.now()))
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState(feeNoteId ?? '')
  const [refusal, setRefusal] = useState<string | null>(null)
  const needsNote = kind === 'to_office' || kind === 'fee_received'
  const { data: notes = [] } = useQuery({ ...feeNotesOptions({ clientId }), enabled: needsNote && !feeNoteId })
  const open = notes.filter((n) => n.status === 'issued' && n.total > n.paid)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        const value = parseShillings(amount)
        const onDay = fromDateInput(day)
        if (!value || !onDay) return
        record.mutate(
          { clientId, matterId, kind, amount: value, onDay, reference: reference.trim() || null, description: description.trim(), feeNoteId: needsNote ? note || null : null },
          {
            onSuccess: () => {
              t.success(m["money.recorded"]())
              onDone()
            },
            onError: (error) => setRefusal(messageOf(error)),
          },
        )
      }}
    >
      {kinds.length > 1 && (
        <div role="radiogroup" aria-label={m["money.what"]()} className="flex flex-col gap-1">
          {kinds.map((k) => (
            <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
              <input type="radio" name="kind" className="mt-1" checked={kind === k} onChange={() => setKind(k)} />
              <span className="flex flex-col">
                <strong>{entryKindLabel(k)}</strong>
                <span className="text-muted-foreground">{entryAbout(k)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {kinds.length === 1 && <p className="text-muted-foreground">{entryAbout(kind)}</p>}
      {needsNote && !feeNoteId && (
        <label className="flex flex-col gap-1.5">
          <span>{m["money.fee_note"]()}</span>
          {open.length ? (
            <Select value={note} onValueChange={(v) => setNote(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m["money.choose_fee_note"]()}>{(v: string) => open.find((n) => n.id === v)?.number ?? ''}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {open.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.number} · {m["money.owed_on"]({ amount: ugx(n.total - n.paid) })}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground">{m["money.no_open_notes"]()}</span>
          )}
        </label>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span>{m["money.amount"]()}</span>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="500000" />
          {parseShillings(amount) ? <span className="text-muted-foreground">{ugx(parseShillings(amount) ?? 0)}</span> : null}
        </label>
        <DateField label={m["money.on"]()} value={day} onChange={setDay} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span>{m["money.description"]()}</span>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={m["money.description_placeholder"]()} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span>{m["money.reference"]()}</span>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={m["money.reference_placeholder"]()} />
      </label>
      <Refusal text={refusal} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" disabled={record.isPending || !parseShillings(amount) || !description.trim() || (needsNote && !note)}>
          {m["money.record"]()}
        </Button>
      </div>
    </form>
  )
}

type Line = { kind: 'fee' | 'disbursement'; description: string; amount: string }

/** A fee note: time not yet billed at an hourly rate, and fees and
 * disbursements as lines. Saved as a draft; issuing numbers and freezes it. */
export function FeeNoteForm({ matterId, existing, onDone }: { matterId: string; existing?: FeeNote; onDone: (note: FeeNote) => void }) {
  const create = useCreateFeeNote()
  const update = useUpdateFeeNote()
  const { data: install } = useQuery(installationOptions())
  const { data: unbilled = [] } = useQuery(unbilledTimeOptions(matterId))
  const billedHere = (existing?.lines ?? []).filter((l) => l.kind === 'time' && l.timeEntryId)
  const time = [
    ...billedHere.map((l) => ({ id: l.timeEntryId as string, minutes: l.minutes ?? 0, description: l.description })),
    ...unbilled.map((u) => ({ id: u.id, minutes: u.minutes, description: `${toIsoDay(u.workedOn)}: ${u.description}` })),
  ]
  const [chosen, setChosen] = useState<string[]>(existing ? billedHere.map((l) => l.timeEntryId as string) : unbilled.map((u) => u.id))
  const [rate, setRate] = useState(String(billedHere[0]?.rate ?? install?.hourlyRate ?? ''))
  const [lines, setLines] = useState<Line[]>((existing?.lines ?? []).filter((l) => l.kind !== 'time').map((l) => ({ kind: l.kind as Line['kind'], description: l.description, amount: String(l.amount) })))
  const [note, setNote] = useState(existing?.note ?? '')
  const [refusal, setRefusal] = useState<string | null>(null)
  const hourly = parseShillings(rate) ?? 0
  const minutes = time.filter((x) => chosen.includes(x.id)).reduce((sum, x) => sum + x.minutes, 0)
  const total = Math.round((minutes * hourly) / 60) + lines.reduce((sum, l) => sum + (parseShillings(l.amount) ?? 0), 0)

  const submit = () => {
    setRefusal(null)
    const input = {
      matterId,
      timeEntryIds: chosen,
      rate: chosen.length ? hourly || null : null,
      lines: lines.filter((l) => l.description.trim() || l.amount).map((l) => ({ kind: l.kind, description: l.description.trim(), amount: parseShillings(l.amount) ?? 0 })),
      note: note.trim() || null,
    }
    const done = { onSuccess: (n: FeeNote) => onDone(n), onError: (error: Error) => setRefusal(messageOf(error)) }
    if (existing) update.mutate({ id: existing.id, input }, done)
    else create.mutate(input, done)
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="text-muted-foreground">{m["money.not_tax_invoice"]()}</p>
      <fieldset className="flex flex-col gap-2">
        <legend>{m["money.time_to_bill"]()}</legend>
        {time.length === 0 ? (
          <span className="text-muted-foreground">{m["money.no_unbilled_time"]()}</span>
        ) : (
          time.map((x) => (
            <label key={x.id} className="flex items-start gap-2">
              <Checkbox className="mt-0.5" checked={chosen.includes(x.id)} onCheckedChange={(v) => setChosen((c) => (v ? [...c, x.id] : c.filter((y) => y !== x.id)))} />
              <span>
                {x.description} <span className="text-muted-foreground">· {m["money.minutes"]({ count: x.minutes })}</span>
              </span>
            </label>
          ))
        )}
        {time.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span>{m["money.rate"]()}</span>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" placeholder="300000" />
          </label>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend>{m["money.lines"]()}</legend>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
            <div className="flex gap-2">
              <Select value={l.kind} onValueChange={(v) => v && setLines((ls) => ls.map((x, j) => (j === i ? { ...x, kind: v as Line['kind'] } : x)))}>
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue>{(v: string) => (v === 'fee' ? m["money.line.fee"]() : m["money.line.disbursement"]())}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="fee">{m["money.line.fee"]()}</SelectItem>
                    <SelectItem value="disbursement">{m["money.line.disbursement"]()}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input value={l.amount} inputMode="numeric" placeholder={m["money.amount"]()} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </div>
            <Input value={l.description} placeholder={m["money.description"]()} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              {m["money.remove_line"]()}
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => setLines((ls) => [...ls, { kind: 'fee', description: '', amount: '' }])}>
          {m["money.add_line"]()}
        </Button>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span>{m["money.note"]()}</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
      </label>
      <p>
        <strong>{m["money.total"]({ amount: ugx(total) })}</strong>
      </p>
      <Refusal text={refusal} />
      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending || update.isPending || total <= 0}>
          {existing ? m["money.save_draft"]() : m["money.make_draft"]()}
        </Button>
      </div>
    </form>
  )
}

export function IssueForm({ note, onDone }: { note: FeeNote; onDone: () => void }) {
  const issue = useIssueFeeNote()
  const [issuedOn, setIssuedOn] = useState(toIsoDay(Date.now()))
  const [dueOn, setDueOn] = useState(toIsoDay(Date.now() + 14 * 86_400_000))
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const on = fromDateInput(issuedOn)
        if (!on) return
        issue.mutate({ id: note.id, issuedOn: on, dueOn: fromDateInput(dueOn) }, { onSuccess: () => onDone(), onError: (error) => setRefusal(messageOf(error)) })
      }}
    >
      <strong>{m["money.issue_title"]()}</strong>
      <p className="text-muted-foreground">{m["money.issue_lead"]()}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DateField label={m["money.issued_on"]()} value={issuedOn} onChange={setIssuedOn} />
        <DateField label={m["money.due_on"]()} value={dueOn} onChange={setDueOn} />
      </div>
      <Refusal text={refusal} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={issue.isPending}>
          {m["money.issue"]()}
        </Button>
      </div>
    </form>
  )
}

/** Asks why, for a cancellation or a reversal: both stay in the books with it. */
export function ReasonForm({ title, lead, action, pending, onSubmit, onDone }: { title: string; lead: string; action: string; pending: boolean; onSubmit: (reason: string, fail: (message: string) => void) => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        onSubmit(reason.trim(), setRefusal)
      }}
    >
      <strong>{title}</strong>
      <p className="text-muted-foreground">{lead}</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m["money.reason"]()} />
      <Refusal text={refusal} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={pending || !reason.trim()}>
          {action}
        </Button>
      </div>
    </form>
  )
}
