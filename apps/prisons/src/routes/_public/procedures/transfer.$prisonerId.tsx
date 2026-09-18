import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import {
  checklistItems,
  parseChecklist,
  transferErrorText,
  transfersForPrisonerOptions,
  useDispatchTransfer,
  usePrepareTransfer,
  useSaveChecklist,
  useTransfersForPrisoner,
  type Checklist,
  type DispatchResult,
} from '@/features/transfers'
import { prisonerFullName, prisonerOptions, usePrisoner } from '@/features/prisoners'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { saveExchangeFile } from '@/lib/exchange-files'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/procedures/transfer/$prisonerId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

type StepId = 'order' | 'checklist' | 'dispatch'

/**
 * Transfer out (docs/prisons/product-map/02 W5, sender side): record the
 * order, work the checklist, then dispatch. Dispatch seals a dossier that
 * travels with the person; the stay stays open until the receiving facility's
 * receipt is imported.
 */
function RouteComponent() {
  const { prisonerId } = Route.useParams()
  const { data: prisoner } = usePrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const open = transfers.find((row) => row.direction === 'out' && (row.state === 'preparing' || row.state === 'in_transit')) ?? null
  const [step, setStep] = useState<StepId>(open ? 'checklist' : 'order')
  const [sent, setSent] = useState<DispatchResult | null>(null)

  if (!prisoner) {
    return (
      <article className="container pt-5 pb-20">
        <p className="text-sm text-muted-foreground">This prisoner could not be found.</p>
      </article>
    )
  }

  const dispatched = open?.state === 'in_transit' || sent !== null
  const checklist = parseChecklist(open?.checklistJson ?? null)
  const checkedCount = checklistItems.filter((item) => checklist[item.key]).length

  const steps: ProcedureStep[] = [
    { id: 'order', label: 'Order and destination', done: open !== null, summary: open?.otherPrisonName ?? null },
    { id: 'checklist', label: 'Checklist', done: open !== null && checkedCount === checklistItems.length, summary: open ? `${checkedCount} of ${checklistItems.length} done` : null },
    { id: 'dispatch', label: 'Dispatch', done: dispatched, summary: dispatched ? 'Sealed and in transit' : null },
  ]

  return (
    <ProcedureShell
      title="Transfer out"
      description="One continuing custody relationship: the person stays in the custody of the prison officer while in transit (s.73(5))."
      backTo={`/prisoners/${prisonerId}`}
      backLabel="Back to the prisoner file"
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
      {open ? 'This transfer has been dispatched, so its checklist is closed.' : 'Record the order and destination first.'}
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
        <h2 className="text-base font-medium">Order and destination</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Destination">{open.otherPrisonName}</Row>
          <Row label="Order reference">{open.orderReference}</Row>
          <Row label="Ordering authority">{open.orderingAuthority}</Row>
          <Row label="Reason">{open.reason}</Row>
          <Row label="Planned">{open.plannedAt ? format(open.plannedAt, 'PPp') : null}</Row>
        </dl>
        <p className="text-xs text-muted-foreground">The order is part of the record. If it was entered wrongly, cancel this transfer from Movements and start again.</p>
      </div>
    )
  }

  if (!inCustody) {
    return <p className="text-sm text-muted-foreground">Only someone in custody here can be prepared for transfer.</p>
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
      t.success('Transfer prepared')
      onCreated()
    } catch (error) {
      t.error('Could not prepare the transfer', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Order and destination</h2>
      <Field>
        <FieldLabel>Destination prison</FieldLabel>
        <Input value={destinationName} onChange={(e) => setDestinationName(e.target.value)} autoFocus />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>Order reference</FieldLabel>
          <Input value={orderReference} onChange={(e) => setOrderReference(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Ordering authority</FieldLabel>
          <Input value={orderingAuthority} onChange={(e) => setOrderingAuthority(e.target.value)} placeholder="Commissioner General, court, other" />
        </Field>
      </div>
      <FieldDescription>Dispatch needs an order reference or an ordering authority (s.73(3)). If the paper order has not arrived, name the authority and attach the order later.</FieldDescription>
      <Field>
        <FieldLabel>Reason</FieldLabel>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Medical need, decongestion, court" />
      </Field>
      <Field>
        <FieldLabel>Planned date and time</FieldLabel>
        <Input type="datetime-local" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>Notes</FieldLabel>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div>
        <Button onClick={submit} disabled={!destinationName.trim() || prepare.isPending}>
          Start the transfer
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children || 'Not recorded'}</dd>
    </div>
  )
}

function ChecklistStep({ transferId, initial, onDone }: { transferId: string; initial: Checklist; onDone: () => void }) {
  const save = useSaveChecklist()
  const [value, setValue] = useState<Checklist>(initial)

  const submit = async () => {
    try {
      await save.mutateAsync({ id: transferId, checklist: value })
      t.success('Checklist saved')
      onDone()
    } catch (error) {
      t.error('Could not save the checklist', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Checklist</h2>
      <p className="text-sm text-muted-foreground">Nothing here blocks dispatch: the checklist travels in the dossier so the receiving facility sees what was done.</p>
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
        <FieldLabel>Note</FieldLabel>
        <Textarea value={value.note ?? ''} onChange={(e) => setValue({ ...value, note: e.target.value || null })} />
      </Field>
      <div>
        <Button onClick={submit} disabled={save.isPending}>
          Save and continue
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
        t.success('Sealed dossier saved', { description: path })
      }
    } catch (error) {
      t.error('Could not save the file', { description: transferErrorText(error, 'Use the save button below.') })
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
      t.error('Could not dispatch', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Dispatched</h2>
        <p className="text-sm">
          The person is now in transit to {destination ?? 'the receiving prison'}. Their stay here stays open until the receiving facility confirms arrival.
        </p>
        <p className="text-sm text-muted-foreground">
          Send the sealed dossier file with the escort or by any route you trust, and give the passphrase to the receiving Officer in Charge by a different route (a phone call, not the same envelope).
          When they confirm, they will give you a receipt file: import it from Movements to close this stay.
        </p>
        {saved && <p className="text-xs text-muted-foreground">Saved to {saved}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => saveFile(sent)}>
            Save the sealed dossier again
          </Button>
          <Link to="/movements" className="inline-flex h-8 items-center rounded-md px-3 text-sm underline-offset-4 hover:underline">
            Go to Movements
          </Link>
        </div>
      </div>
    )
  }

  if (dispatchedTransferId) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-medium">Dispatched</h2>
        <p className="text-sm text-muted-foreground">
          This transfer is in transit. Re-export the sealed dossier or import the receiving facility's receipt from{' '}
          <Link to="/movements" className="underline">
            Movements
          </Link>
          .
        </p>
      </div>
    )
  }

  if (!transferId) return <p className="text-sm text-muted-foreground">Record the order and destination first.</p>

  const mismatch = again.length > 0 && again !== passphrase
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Dispatch</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>Departed at</FieldLabel>
          <Input type="datetime-local" value={departedAt} onChange={(e) => setDepartedAt(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Escort officers</FieldLabel>
          <Input value={escort} onChange={(e) => setEscort(e.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel>Transport</FieldLabel>
        <Input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="Vehicle, registration" />
      </Field>
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Seal the dossier</p>
        <p className="text-xs text-muted-foreground">
          The dossier carries the person's identity, legal documents, sentence, property statement and contacts. It is sealed with a passphrase you choose. The sending Officer in Charge must give this passphrase to the receiving Officer in Charge by another route. Without it, the file cannot be opened.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Passphrase</FieldLabel>
            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
          </Field>
          <Field>
            <FieldLabel>Enter it again</FieldLabel>
            <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="off" aria-invalid={mismatch} />
          </Field>
        </div>
        {mismatch && <p className="text-xs text-destructive">The two passphrases do not match.</p>}
        {passphrase.length > 0 && passphrase.length < 8 && <p className="text-xs text-destructive">At least 8 characters.</p>}
      </div>
      <div>
        <Button onClick={submit} disabled={passphrase.length < 8 || passphrase !== again || dispatch.isPending}>
          Dispatch and save the sealed dossier
        </Button>
      </div>
    </div>
  )
}
