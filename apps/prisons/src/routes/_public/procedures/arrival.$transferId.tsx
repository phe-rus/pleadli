import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import {
  dossierPreviewOptions,
  getReceiptFile,
  transferErrorText,
  transfersOptions,
  useConfirmArrival,
  useDossierPreview,
  useTransfers,
} from '@/features/transfers'
import { admissionInstrumentLabel, pendingDocumentTypeLabel, prisonerFullName, prisonerStatusLabel } from '@/features/prisoners'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { saveExchangeFile } from '@/lib/exchange-files'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState, type ReactNode } from 'react'

export const Route = createFileRoute('/_public/procedures/arrival/$transferId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...dossierPreviewOptions(params.transferId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

type StepId = 'review' | 'identity' | 'property' | 'place'

/**
 * Arrival (docs/prisons/product-map/02 W5, receiver side): identity is checked
 * against the dossier before anything is accepted, property is reconciled line
 * by line, the person is placed, and only then is arrival confirmed. Confirming
 * makes this facility the holder of the live record and produces the receipt
 * that goes back to the sender.
 */
function RouteComponent() {
  const { transferId } = Route.useParams()
  const { data: dossier } = useDossierPreview(transferId)
  const { data: transfers } = useTransfers()
  const transfer = transfers.find((row) => row.id === transferId) ?? null
  const confirm = useConfirmArrival()

  const [step, setStep] = useState<StepId>('review')
  const [identityVerified, setIdentityVerified] = useState(false)
  const [discrepancyNote, setDiscrepancyNote] = useState('')
  const [received, setReceived] = useState<Record<string, boolean>>(() => Object.fromEntries(dossier.property.map((line) => [line.id, true])))
  const [placement, setPlacement] = useState('')
  const [healthScreenNote, setHealthScreenNote] = useState('')
  const [receivedAt, setReceivedAt] = useState(toDatetimeLocal(Date.now()))
  const [receiptSaved, setReceiptSaved] = useState<string | null>(null)

  const p = dossier.prisoner
  const confirmed = transfer?.state === 'confirmed'
  const missing = dossier.property.filter((line) => !received[line.id])

  const saveReceipt = async () => {
    try {
      const path = await saveExchangeFile(await getReceiptFile(transferId))
      if (path) {
        setReceiptSaved(path)
        t.success('Receipt saved', { description: path })
      }
    } catch (error) {
      t.error('Could not save the receipt', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  const submit = async () => {
    try {
      await confirm.mutateAsync({
        id: transferId,
        input: {
          identityVerified,
          discrepancyNote,
          property: dossier.property.map((line) => ({ id: line.id, received: received[line.id] ?? false })),
          placement,
          healthScreenNote,
          receivedAt: fromDatetimeLocal(receivedAt),
        },
      })
      t.success('Arrival confirmed', { description: 'This facility now holds the record.' })
      await saveReceipt()
    } catch (error) {
      t.error('Could not confirm the arrival', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  if (confirmed) {
    return (
      <article className="container flex flex-col gap-4 pt-5 pb-20 md:max-w-2xl">
        <Link to="/movements" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
          Back to Movements
        </Link>
        <h1>Arrival confirmed</h1>
        <p className="text-sm">
          {prisonerFullName({ firstName: p.firstName, lastName: p.lastName, otherNames: p.otherNames })} is now held here. The record moved with them, and this facility owns it from now on.
        </p>
        <p className="text-sm text-muted-foreground">
          The sending facility keeps their own record open until it imports the receipt. Take the receipt file back to the sender (or send it by any route you trust): it does not contain the person's details.
        </p>
        {receiptSaved && <p className="text-xs text-muted-foreground">Saved to {receiptSaved}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveReceipt}>Save the receipt file</Button>
          {transfer?.prisonerId && (
            <Link to="/prisoners/$prisonerId" params={{ prisonerId: transfer.prisonerId }} className={buttonVariants({ variant: 'secondary' })}>
              Open the prisoner file
            </Link>
          )}
        </div>
      </article>
    )
  }

  const steps: ProcedureStep[] = [
    { id: 'review', label: 'Review the dossier', summary: `From ${dossier.fromFacility}`, done: step !== 'review' },
    { id: 'identity', label: 'Verify identity', done: identityVerified, summary: identityVerified ? 'Matches the dossier' : null },
    { id: 'property', label: 'Reconcile property', done: dossier.property.length === 0 || step === 'place', summary: `${dossier.property.length - missing.length} of ${dossier.property.length} received` },
    { id: 'place', label: 'Place and confirm', done: false, summary: placement || null },
  ]

  return (
    <ProcedureShell
      title="Arrival"
      description="Accept the person only if they match the dossier. Confirming makes this facility the holder of the live record."
      backTo="/movements"
      backLabel="Back to Movements"
      steps={steps}
      current={step}
      onSelect={(id) => setStep(id as StepId)}
      aside={
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3 text-sm">
          <span className="font-medium">{prisonerFullName({ firstName: p.firstName, lastName: p.lastName, otherNames: p.otherNames })}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(p.status)}</Badge>
            {dossier.returning && <Badge variant="outline">Returning: earlier record here</Badge>}
            {p.documentsPending && <Badge variant="destructive">Documents pending</Badge>}
          </div>
        </div>
      }
    >
      {step === 'review' && (
        <div className="flex flex-col gap-5">
          <h2 className="text-base font-medium">The dossier</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Sent by">{dossier.fromFacility}</Row>
            <Row label="Departed">{format(dossier.departedAt, 'PPp')}</Row>
            <Row label="Order">{dossier.orderReference ?? dossier.orderingAuthority}</Row>
            <Row label="Legal category">{prisonerStatusLabel(p.status)}</Row>
            <Row label="Offence">{p.offence}</Row>
            <Row label="Originally admitted">{format(p.admittedAt, 'PP')}</Row>
            <Row label="National ID">{p.nationalId}</Row>
            <Row label="Date of birth">{p.dateOfBirth ? format(p.dateOfBirth, 'PP') : null}</Row>
            <Row label="Sex">{p.sex}</Row>
            <Row label="Sentence">
              {dossier.sentence
                ? dossier.sentence.isLife
                  ? `Life, from ${format(dossier.sentence.startsOn, 'PP')}`
                  : `${[dossier.sentence.termYears && `${dossier.sentence.termYears} y`, dossier.sentence.termMonths && `${dossier.sentence.termMonths} m`, dossier.sentence.termDays && `${dossier.sentence.termDays} d`].filter(Boolean).join(' ')}, from ${format(dossier.sentence.startsOn, 'PP')}`
                : null}
            </Row>
          </dl>

          <Block title="Legal instruments">
            {dossier.instruments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in the dossier.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {dossier.instruments.map((instrument) => (
                  <li key={instrument.id} className="flex flex-wrap items-center gap-2">
                    <span>{admissionInstrumentLabel(instrument.kind) === instrument.kind ? (pendingDocumentTypeLabel(instrument.kind) ?? instrument.kind) : admissionInstrumentLabel(instrument.kind)}</span>
                    {instrument.issuingAuthority && <span className="text-muted-foreground">{instrument.issuingAuthority}</span>}
                    <Badge variant={instrument.status === 'verified' ? 'outline' : 'destructive'}>{instrument.status.replace('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {dossier.fileNames.length > 0 && <p className="text-xs text-muted-foreground">Documents that will be filed: {dossier.fileNames.join(', ')}</p>}
          </Block>

          <Block title="Court productions carried over">
            {dossier.scheduledProductions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None scheduled.</p>
            ) : (
              <ul className="text-sm">
                {dossier.scheduledProductions.map((production, index) => (
                  <li key={index}>
                    {format(production.productionDate, 'PPp')}, {production.courtReference ?? 'court'} ({production.productionMethod})
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Contacts">
            {dossier.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="text-sm">
                {dossier.contacts.map((contact, index) => (
                  <li key={index}>
                    {contact.name}
                    {contact.relationship ? `, ${contact.relationship}` : ''}
                    {contact.phone ? `, ${contact.phone}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="What the sender did before dispatch">
            <p className="text-sm text-muted-foreground">
              {Object.entries(dossier.checklist)
                .filter(([key, value]) => key !== 'note' && value === true)
                .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase())
                .join(', ') || 'Nothing was ticked off.'}
              {dossier.checklist.note ? ` Note: ${dossier.checklist.note}` : ''}
            </p>
          </Block>
          <div>
            <Button onClick={() => setStep('identity')}>Continue to identity</Button>
          </div>
        </div>
      )}

      {step === 'identity' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Verify identity</h2>
          <p className="text-sm text-muted-foreground">
            Compare the person in front of you with the dossier: name, age, national ID if they have one, and the order. If they do not match, do not accept them. Tell the sending facility.
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-0.5" checked={identityVerified} onCheckedChange={(checked) => setIdentityVerified(checked === true)} />I have checked this person against the dossier and they match.
          </label>
          <Field>
            <FieldLabel>Discrepancies noticed (optional)</FieldLabel>
            <Textarea value={discrepancyNote} onChange={(e) => setDiscrepancyNote(e.target.value)} placeholder="Anything that differs from the dossier but does not change who they are" />
          </Field>
          <div>
            <Button onClick={() => setStep('property')} disabled={!identityVerified}>
              Continue to property
            </Button>
          </div>
        </div>
      )}

      {step === 'property' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Reconcile property</h2>
          {dossier.property.length === 0 ? (
            <p className="text-sm text-muted-foreground">The dossier lists no property.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tick each item that arrived. Items not ticked are reported to the sender on the receipt.</p>
              <ul className="flex flex-col gap-2">
                {dossier.property.map((line) => (
                  <li key={line.id}>
                    <label className="flex items-start gap-2.5 text-sm">
                      <Checkbox className="mt-0.5" checked={received[line.id] ?? false} onCheckedChange={(checked) => setReceived({ ...received, [line.id]: checked === true })} />
                      {line.description}
                    </label>
                  </li>
                ))}
              </ul>
              {missing.length > 0 && <p className="text-xs text-destructive">{missing.length} item(s) will be reported as not received.</p>}
            </>
          )}
          <div>
            <Button onClick={() => setStep('place')}>Continue to placement</Button>
          </div>
        </div>
      )}

      {step === 'place' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Place and confirm</h2>
          <Field>
            <FieldLabel>Accommodation</FieldLabel>
            <Input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="Ward, cell" />
          </Field>
          <Field>
            <FieldLabel>Health screening note (optional)</FieldLabel>
            <Textarea value={healthScreenNote} onChange={(e) => setHealthScreenNote(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Received at</FieldLabel>
            <Input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
          {!identityVerified && <p className="text-xs text-destructive">Verify identity before confirming.</p>}
          <div>
            <Button onClick={submit} disabled={!identityVerified || confirm.isPending}>
              Confirm arrival and save the receipt
            </Button>
          </div>
        </div>
      )}
    </ProcedureShell>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children || 'Not recorded'}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}
