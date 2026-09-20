import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import {
  checklistItems,
  parseChecklist,
  transferErrorText,
  useDispatchTransfer,
  usePrepareTransfer,
  useSaveChecklist,
  useTransfersForPrisoner,
  type Checklist,
  type DispatchResult,
} from '@/features/transfers'
import { prisonerFullName, usePrisoner } from '@/features/prisoners'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { saveExchangeFile } from '@/lib/exchange-files'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

type StepId = 'order' | 'checklist' | 'dispatch'

/**
 * Transfer out (docs/prisons/product-map/02 W5, sender side): record the
 * order, work the checklist, then dispatch. Dispatch seals a dossier that
 * travels with the person; the stay stays open until the receiving facility's
 * receipt is imported.
 */
export function TransferOutPage({ prisonerId }: { prisonerId: string }) {
  const { data: prisoner } = usePrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const open = transfers.find((row) => row.direction === 'out' && (row.state === 'preparing' || row.state === 'in_transit')) ?? null
  const [step, setStep] = useState<StepId>(open ? 'checklist' : 'order')
  const [sent, setSent] = useState<DispatchResult | null>(null)

  if (!prisoner) {
    return (
      <article className="page">
        <p className="text-sm text-muted-foreground">{m.route_procedures_this_prisoner_could_not_be_found()}</p>
      </article>
    )
  }

  const dispatched = open?.state === 'in_transit' || sent !== null
  const checklist = parseChecklist(open?.checklistJson ?? null)
  const checkedCount = checklistItems.filter((item) => checklist[item.key]).length

  const steps: ProcedureStep[] = [
    { id: 'order', label: m.route_procedures_order_and_destination(), done: open !== null, summary: open?.otherPrisonName ?? null },
    { id: 'checklist', label: m.route_procedures_checklist(), done: open !== null && checkedCount === checklistItems.length, summary: open ? `${checkedCount} of ${checklistItems.length} done` : null },
    { id: 'dispatch', label: m.route_procedures_dispatch(), done: dispatched, summary: dispatched ? m.route_procedures_sealed_and_in_transit() : null },
  ]

  return (
    <ProcedureShell
      title={m.route_procedures_transfer_out()}
      description={m.route_procedures_one_continuing_custody_relationship_the()}
      backTo={`/prisoners/${prisonerId}`}
      backLabel={m.route_procedures_back_to_the_prisoner_file()}
      steps={steps}
      current={step}
      onSelect={(id) => setStep(id as StepId)}
      aside={
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 p-3 text-sm">
          <Link to="/prisoners/$prisonerId" params={{ prisonerId }} className="font-medium hover:underline">
            {prisonerFullName(prisoner)}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{prisoner.status}</Badge>
            <Badge variant="outline">{prisoner.currentStatus.replace('_', ' ')}</Badge>
          </div>
        </div>
      }
    >
      {step === 'order' && <OrderStep prisonerId={prisonerId} open={open} inCustody={prisoner.currentStatus === 'in_custody'} onCreated={() => setStep('checklist')} />}
      {step === 'checklist' && (open?.state === 'preparing' ? <ChecklistStep transferId={open.id} initial={checklist} onDone={() => setStep('dispatch')} /> : <NeedsOpenTransfer open={open} />)}
      {step === 'dispatch' && (
        <DispatchStep
          transferId={open?.state === 'preparing' ? open.id : null}
          dispatchedTransferId={open?.state === 'in_transit' ? open.id : null}
          sent={sent}
          onSent={setSent}
          destination={open?.otherPrisonName ?? null}
        />
      )}
    </ProcedureShell>
  )
}

function NeedsOpenTransfer({ open }: { open: { state: string } | null }) {
  return (
    <p className="text-sm text-muted-foreground">
      {open ? m.route_procedures_this_transfer_has_been_dispatched_so() : m.route_procedures_record_the_order_and_destination_first()}
    </p>
  )
}

function OrderStep({ prisonerId, open, inCustody, onCreated }: { prisonerId: string; open: { state: string; otherPrisonName: string | null; orderReference: string | null; orderingAuthority: string | null; reason: string | null; plannedAt: number | null } | null; inCustody: boolean; onCreated: () => void }) {
  const prepare = usePrepareTransfer()
  const [destinationName, setDestinationName] = useState('')
  const [orderReference, setOrderReference] = useState('')
  const [orderingAuthority, setOrderingAuthority] = useState('')
  const [reason, setReason] = useState('')
  const [plannedAt, setPlannedAt] = useState(toDatetimeLocal(Date.now()))
  const [notes, setNotes] = useState('')

  if (open) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{m.route_procedures_order_and_destination()}</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={m.route_procedures_destination()}>{open.otherPrisonName}</Row>
          <Row label={m.route_procedures_order_reference()}>{open.orderReference}</Row>
          <Row label={m.route_procedures_ordering_authority()}>{open.orderingAuthority}</Row>
          <Row label={m.route_procedures_reason()}>{open.reason}</Row>
          <Row label={m.route_procedures_planned()}>{open.plannedAt ? format(open.plannedAt, 'PPp') : null}</Row>
        </dl>
        <p className="text-xs text-muted-foreground">{m.route_procedures_the_order_is_part_of_the()}</p>
      </div>
    )
  }

  if (!inCustody) {
    return <p className="text-sm text-muted-foreground">{m.route_procedures_only_someone_in_custody_here_can()}</p>
  }

  const submit = async () => {
    try {
      await prepare.mutateAsync({
        prisonerId,
        destinationName,
        orderReference,
        orderingAuthority,
        reason,
        plannedAt: fromDatetimeLocal(plannedAt),
        notes,
      })
      t.success(m.route_procedures_transfer_prepared())
      onCreated()
    } catch (error) {
      t.error(m.route_procedures_could_not_prepare_the_transfer(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">{m.route_procedures_order_and_destination()}</h2>
      <Field>
        <FieldLabel>{m.route_procedures_destination_prison()}</FieldLabel>
        <Input value={destinationName} onChange={(e) => setDestinationName(e.target.value)} autoFocus />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>{m.route_procedures_order_reference()}</FieldLabel>
          <Input value={orderReference} onChange={(e) => setOrderReference(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{m.route_procedures_ordering_authority()}</FieldLabel>
          <Input value={orderingAuthority} onChange={(e) => setOrderingAuthority(e.target.value)} placeholder={m.route_procedures_commissioner_general_court_other()} />
        </Field>
      </div>
      <FieldDescription>{m.route_procedures_dispatch_needs_an_order_reference_or()}</FieldDescription>
      <Field>
        <FieldLabel>{m.route_procedures_reason()}</FieldLabel>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m.route_procedures_medical_need_decongestion_court()} />
      </Field>
      <Field>
        <FieldLabel>{m.route_procedures_planned_date_and_time()}</FieldLabel>
        <Input type="datetime-local" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{m.route_procedures_notes()}</FieldLabel>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div>
        <Button onClick={submit} disabled={!destinationName.trim() || prepare.isPending}>
          {m.route_procedures_start_the_transfer()}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children || m.route_procedures_not_recorded()}</dd>
    </div>
  )
}

function ChecklistStep({ transferId, initial, onDone }: { transferId: string; initial: Checklist; onDone: () => void }) {
  const save = useSaveChecklist()
  const [value, setValue] = useState<Checklist>(initial)

  const submit = async () => {
    try {
      await save.mutateAsync({ id: transferId, checklist: value })
      t.success(m.route_procedures_checklist_saved())
      onDone()
    } catch (error) {
      t.error(m.route_procedures_could_not_save_the_checklist(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">{m.route_procedures_checklist()}</h2>
      <p className="text-sm text-muted-foreground">{m.route_procedures_nothing_here_blocks_dispatch_the_checkli()}</p>
      <ul className="flex flex-col gap-2">
        {checklistItems.map((item) => (
          <li key={item.key}>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={value[item.key]} onCheckedChange={(checked) => setValue({ ...value, [item.key]: checked === true })} />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      <Field>
        <FieldLabel>{m.route_procedures_note()}</FieldLabel>
        <Textarea value={value.note ?? ''} onChange={(e) => setValue({ ...value, note: e.target.value || null })} />
      </Field>
      <div>
        <Button onClick={submit} disabled={save.isPending}>
          {m.route_procedures_save_and_continue()}
        </Button>
      </div>
    </div>
  )
}

function DispatchStep({
  transferId,
  dispatchedTransferId,
  sent,
  onSent,
  destination,
}: {
  transferId: string | null
  dispatchedTransferId: string | null
  sent: DispatchResult | null
  onSent: (result: DispatchResult) => void
  destination: string | null
}) {
  const dispatch = useDispatchTransfer()
  const [departedAt, setDepartedAt] = useState(toDatetimeLocal(Date.now()))
  const [escort, setEscort] = useState('')
  const [transport, setTransport] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [again, setAgain] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  const saveFile = async (result: DispatchResult) => {
    try {
      const path = await saveExchangeFile(result.file)
      if (path) {
        setSaved(path)
        t.success(m.route_procedures_sealed_dossier_saved(), { description: path })
      }
    } catch (error) {
      t.error(m.route_procedures_could_not_save_the_file(), { description: transferErrorText(error, m.route_procedures_use_the_save_button_below()) })
    }
  }

  const submit = async () => {
    if (!transferId) return
    try {
      const result = await dispatch.mutateAsync({
        id: transferId,
        input: { departedAt: fromDatetimeLocal(departedAt), escort, transport, passphrase },
      })
      onSent(result)
      await saveFile(result)
    } catch (error) {
      t.error(m.route_procedures_could_not_dispatch(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{m.route_procedures_dispatched()}</h2>
        <p className="text-sm">
          {m.route_procedures_in_transit_to({ destination: destination ?? m.route_procedures_the_receiving_prison() })}
        </p>
        <p className="text-sm text-muted-foreground">
          {m.route_procedures_send_the_sealed_dossier_file_with()}
        </p>
        {saved && <p className="text-xs text-muted-foreground">{m.route_procedures_saved_to_2({ saved })}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => saveFile(sent)}>
            {m.route_procedures_save_the_sealed_dossier_again()}
          </Button>
          <Link to="/movements" className="inline-flex h-8 items-center rounded-md px-3 text-sm underline-offset-4 hover:underline">
            {m.route_procedures_go_to_movements()}
          </Link>
        </div>
      </div>
    )
  }

  if (dispatchedTransferId) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-medium">{m.route_procedures_dispatched()}</h2>
        <p className="text-sm text-muted-foreground">
          {m.route_procedures_transfer_in_transit_reexport()}{' '}
          <Link to="/movements" className="underline">
            {m.route_procedures_movements()}
          </Link>
          .
        </p>
      </div>
    )
  }

  if (!transferId) return <p className="text-sm text-muted-foreground">{m.route_procedures_record_the_order_and_destination_first()}</p>

  const mismatch = again.length > 0 && again !== passphrase
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">{m.route_procedures_dispatch()}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>{m.route_procedures_departed_at()}</FieldLabel>
          <Input type="datetime-local" value={departedAt} onChange={(e) => setDepartedAt(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{m.route_procedures_escort_officers()}</FieldLabel>
          <Input value={escort} onChange={(e) => setEscort(e.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel>{m.route_procedures_transport()}</FieldLabel>
        <Input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder={m.route_procedures_vehicle_registration()} />
      </Field>
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">{m.route_procedures_seal_the_dossier()}</p>
        <p className="text-xs text-muted-foreground">
          {m.route_procedures_the_dossier_carries_the_person_s()}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>{m.route_procedures_passphrase()}</FieldLabel>
            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
          </Field>
          <Field>
            <FieldLabel>{m.route_procedures_enter_it_again()}</FieldLabel>
            <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="off" aria-invalid={mismatch} />
          </Field>
        </div>
        {mismatch && <p className="text-xs text-destructive">{m.route_procedures_the_two_passphrases_do_not_match()}</p>}
        {passphrase.length > 0 && passphrase.length < 8 && <p className="text-xs text-destructive">{m.route_procedures_at_least_8_characters()}</p>}
      </div>
      <div>
        <Button onClick={submit} disabled={passphrase.length < 8 || passphrase !== again || dispatch.isPending}>
          {m.route_procedures_dispatch_and_save_the_sealed_dossier()}
        </Button>
      </div>
    </div>
  )
}
