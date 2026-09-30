import { PanelButton } from '@/components/add-panel'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { useActor } from '@/features/installation'
import { formatDay } from '@/lib/dates'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { clientMoneyOptions, feeNotesOptions, ugx, unbilledTimeOptions, useReverseEntry, type FeeNoteSummary, type LedgerEntry } from './data'
import { billsOptions, instructionBases, useCreateBill, type InstructionBasis } from './bills'
import { EntryForm, entryKindLabel, FeeNoteForm, ReasonForm } from './money-forms'
import { parseShillings } from './data'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'

const UNBILLED = ['state_appointed', 'pro_bono', 'legal_aid_clinic']

/** Only an advocate or the accounts person keeps the books (the backend says so too). */
export function useKeepsBooks() {
  const role = useActor()?.role
  return role === 'advocate' || role === 'accounts'
}

export function FeeNoteTag({ note }: { note: FeeNoteSummary }) {
  if (note.status === 'draft') return <Tag tone="open">{m["money.status.draft"]()}</Tag>
  if (note.status === 'cancelled') return <Tag tone="neutral">{m["money.status.cancelled"]()}</Tag>
  if (note.paid >= note.total) return <Tag tone="done">{m["money.status.paid"]()}</Tag>
  const late = note.dueOn != null && note.dueOn < Date.now()
  return <Tag tone={late ? 'urgent' : 'waiting'}>{late ? m["money.status.overdue"]() : m["money.status.owed"]()}</Tag>
}

/** The money side of one matter: what the client holds and owes, fee notes,
 * and time not yet billed. State brief, pro bono and clinic work is not billed. */
export function MoneySection({ matterId, clientId, engagement, open }: { matterId: string; clientId: string; engagement: string; open: boolean }) {
  const keeps = useKeepsBooks()
  const navigate = useNavigate()
  const { data: books } = useQuery(clientMoneyOptions(clientId))
  const { data: notes = [] } = useQuery(feeNotesOptions({ matterId }))
  const { data: unbilled = [] } = useQuery(unbilledTimeOptions(matterId))
  const { data: bills = [] } = useQuery(billsOptions(matterId))
  const billed = !UNBILLED.includes(engagement)
  const hours = unbilled.reduce((sum, u) => sum + u.minutes, 0) / 60

  return (
    <section aria-labelledby="money" className="page-section">
      <div className="flex items-center justify-between gap-2">
        <h2 id="money">{m["money.title"]()}</h2>
        {keeps && open && (
          <div className="flex gap-2">
            <PanelButton label={m["money.in_out"]()} title={m["money.in_out_title"]()} description={m["money.in_out_description"]({ client: books?.clientName ?? '' })} variant="ghost" icon={false}>
              {({ close }) => <EntryForm clientId={clientId} matterId={matterId} kinds={['received', 'paid_out', 'disbursement']} onDone={close} />}
            </PanelButton>
            <PanelButton label={m["bill.title"]()} title={m["bill.new"]()} description={m["bill.new_description"]()} variant="ghost" icon={false}>
              {({ close }) => (
                <NewBillForm
                  matterId={matterId}
                  onDone={(id) => {
                    close()
                    void navigate({ to: '/money/bills/$billId', params: { billId: id } })
                  }}
                />
              )}
            </PanelButton>
            {billed && (
              <PanelButton label={m["money.new_fee_note"]()} title={m["money.new_fee_note"]()} description={m["money.fee_note_description"]()} variant="ghost">
                {({ close }) => (
                  <FeeNoteForm
                    matterId={matterId}
                    onDone={(n) => {
                      close()
                      void navigate({ to: '/money/$feeNoteId', params: { feeNoteId: n.id } })
                    }}
                  />
                )}
              </PanelButton>
            )}
          </div>
        )}
      </div>
      {!billed && <p className="text-muted-foreground">{m["money.not_billed"]()}</p>}
      {books && (
        <p>
          {m["money.held"]({ amount: ugx(books.clientBalance) })} · {m["money.owed"]({ amount: ugx(books.owed) })}
          {billed && hours > 0 && <> · {m["money.unbilled_hours"]({ hours: hours.toFixed(1) })}</>}
          {' · '}
          <Link to="/money" search={{ client: clientId }} className="text-primary underline">
            {m["money.client_books"]()}
          </Link>
        </p>
      )}
      {bills.length > 0 && (
        <RowList>
          {bills.map((b) => (
            <Row
              key={b.id}
              aligned
              title={
                <Link to="/money/bills/$billId" params={{ billId: b.id }} className="text-foreground">
                  {m["bill.title"]()} · {b.against === 'other_side' ? m["bill.against.other_side"]() : m["bill.against.client"]()}
                </Link>
              }
              summary={[m["bill.claimed_total"]({ amount: ugx(b.claimed) }), b.status === 'taxed' ? m["bill.taxed_total"]({ amount: ugx(b.taxed) }) : null].filter(Boolean).join(' · ')}
              trailing={<Tag tone={b.status === 'taxed' ? 'done' : b.status === 'lodged' ? 'waiting' : 'open'}>{m[`bill.status.${b.status}`]()}</Tag>}
            />
          ))}
        </RowList>
      )}
      {notes.length === 0 ? (
        billed && <EmptyNote>{m["money.no_fee_notes"]()}</EmptyNote>
      ) : (
        <RowList>
          {notes.map((n) => (
            <Row
              key={n.id}
              aligned
              title={
                <Link to="/money/$feeNoteId" params={{ feeNoteId: n.id }} className="text-foreground">
                  {n.number ?? m["money.status.draft"]()}
                </Link>
              }
              summary={[ugx(n.total), n.issuedOn ? formatDay(n.issuedOn) : null, n.paid > 0 ? m["money.paid_so_far"]({ amount: ugx(n.paid) }) : null].filter(Boolean).join(' · ')}
              trailing={<FeeNoteTag note={n} />}
            />
          ))}
        </RowList>
      )}
    </section>
  )
}

/** A client's books: both accounts oldest first, a running balance for the
 * client account, and a way to reverse a mistake. Nothing is edited. */
export function ClientBooks({ clientId }: { clientId: string }) {
  const keeps = useKeepsBooks()
  const { data: books } = useQuery(clientMoneyOptions(clientId))
  const reverse = useReverseEntry()
  const [reversing, setReversing] = useState<string | null>(null)
  if (!books) return null
  let running = 0
  const rows = books.entries.map((e) => {
    const sign = e.account === 'client' ? (e.kind === 'received' ? 1 : -1) * (e.reverses ? -1 : 1) : 0
    running += sign * e.amount
    return { e, sign, balance: e.account === 'client' ? running : null }
  })

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <p>
        <strong>{m["money.held"]({ amount: ugx(books.clientBalance) })}</strong> · {m["money.owed"]({ amount: ugx(books.owed) })}
        {books.disbursementsUnbilled > 0 && <> · {m["money.disbursed_unbilled"]({ amount: ugx(books.disbursementsUnbilled) })}</>}
      </p>
      <p className="text-muted-foreground">{m["money.books_lead"]()}</p>
      {keeps && (
        <PanelButton label={m["money.in_out"]()} title={m["money.in_out_title"]()} description={m["money.in_out_description"]({ client: books.clientName })} variant="secondary" icon={false}>
          {({ close }) => <EntryForm clientId={clientId} matterId={null} kinds={['received', 'paid_out', 'disbursement', 'to_office', 'fee_received']} onDone={close} />}
        </PanelButton>
      )}
      {rows.length === 0 ? (
        <EmptyNote>{m["money.no_entries"]()}</EmptyNote>
      ) : (
        <ol className="flex list-none flex-col divide-y divide-border p-0">
          {rows.map(({ e, sign, balance }) => (
            <li key={e.id} className={cn('flex flex-col gap-1 py-2', (e.reversed || e.reverses) && 'text-muted-foreground')}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span>
                    {formatDay(e.onDay)} · <strong>{entryKindLabel(e.kind)}</strong>
                    {e.reverses && <> · {m["money.reversal"]()}</>}
                    {e.reversed && <> · {m["money.reversed"]()}</>}
                  </span>
                  <span>{[e.description, e.feeNoteNumber, e.reference, e.matterTitle].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{ugx(e.amount)}</span>
                  {balance != null && <span className="text-muted-foreground">{ugx(balance)}</span>}
                </span>
              </div>
              <EntryActions entry={e} keeps={keeps} open={reversing === e.id} onOpen={() => setReversing(e.id)} onClose={() => setReversing(null)} pending={reverse.isPending} onReverse={(reason, fail) => reverse.mutate({ id: e.id, reason }, { onSuccess: () => { t.success(m["money.reversed_done"]()); setReversing(null) }, onError: (error) => fail(messageOf(error)) })} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function EntryActions({ entry, keeps, open, onOpen, onClose, pending, onReverse }: { entry: LedgerEntry; keeps: boolean; open: boolean; onOpen: () => void; onClose: () => void; pending: boolean; onReverse: (reason: string, fail: (m: string) => void) => void }) {
  if (!keeps || entry.reverses || entry.reversed) return null
  return open ? (
    <ReasonForm title={m["money.reverse_title"]()} lead={m["money.reverse_lead"]()} action={m["money.reverse"]()} pending={pending} onSubmit={onReverse} onDone={onClose} />
  ) : (
    <Button size="sm" variant="ghost" className="w-fit" onClick={onOpen}>
      {m["money.reverse"]()}
    </Button>
  )
}

/** Starts a bill of costs: whose costs, and the value item 1 is taken on. */
function NewBillForm({ matterId, onDone }: { matterId: string; onDone: (id: string) => void }) {
  const create = useCreateBill()
  const [against, setAgainst] = useState<'other_side' | 'client'>('other_side')
  const [value, setValue] = useState('')
  const [basis, setBasis] = useState<InstructionBasis>('1_1')
  const [refusal, setRefusal] = useState<string | null>(null)
  const basisText = (b: string) => ({ '1_1': m["bill.basis.full"], '1_2': m["bill.basis.no_defence"], '1_3': m["bill.basis.leave_refused"], '1_4': m["bill.basis.settled"] })[b as InstructionBasis]?.() ?? b
  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        create.mutate({ matterId, against, subjectValue: parseShillings(value), instructionBasis: basis }, { onSuccess: (b) => onDone(b.id), onError: (error) => setRefusal(messageOf(error)) })
      }}
    >
      <div role="radiogroup" className="flex flex-col gap-1">
        {(['other_side', 'client'] as const).map((a) => (
          <label key={a} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="against" checked={against === a} onChange={() => setAgainst(a)} />
            <span>{a === 'other_side' ? m["bill.against.other_side"]() : m["bill.against.client"]()}</span>
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span>{m["bill.value"]()}</span>
        <Input value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value)} placeholder="12400000" />
        <span className="text-muted-foreground">{m["bill.value_hint"]()}</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span>{m["bill.basis_label"]()}</span>
        <Select value={basis} onValueChange={(v) => v && setBasis(v as InstructionBasis)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: string) => basisText(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {instructionBases.map((b) => (
                <SelectItem key={b} value={b}>
                  {basisText(b)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <p className="text-muted-foreground">{m["bill.proposed"]()}</p>
      {refusal && (
        <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
          {refusal}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending}>
          {m["bill.draw"]()}
        </Button>
      </div>
    </form>
  )
}
