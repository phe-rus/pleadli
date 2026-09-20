import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import {
  getReceiptFile,
  transferErrorText,
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
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState, type ReactNode } from 'react'
import { m } from '@/paraglide/messages'

type StepId = 'review' | 'identity' | 'property' | 'place'

/**
 * Arrival (docs/prisons/product-map/02 W5, receiver side): identity is checked
 * against the dossier before anything is accepted, property is reconciled line
 * by line, the person is placed, and only then is arrival confirmed. Confirming
 * makes this facility the holder of the live record and produces the receipt
 * that goes back to the sender.
 */
export function ArrivalPage({ transferId }: { transferId: string }) {
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
        t.success(m.route_procedures_receipt_saved(), { description: path })
      }
    } catch (error) {
      t.error(m.route_procedures_could_not_save_the_receipt(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
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
      t.success(m.route_procedures_arrival_confirmed(), { description: m.route_procedures_this_facility_now_holds_the_record() })
      await saveReceipt()
    } catch (error) {
      t.error(m.route_procedures_could_not_confirm_the_arrival(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
    }
  }

  if (confirmed) {
    return (
      <article className="page page-narrow">
        <header className="page-header">
          <div>
            <Link to="/movements" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
              {m.route_procedures_back_to_movements()}
            </Link>
            <h1>{m.route_procedures_arrival_confirmed()}</h1>
          </div>
        </header>
        <p className="text-sm">
          {m.route_procedures_is_now_held_here_the_record({ prisonerFullName: prisonerFullName({ firstName: p.firstName, lastName: p.lastName, otherNames: p.otherNames }) })}</p>
        <p className="text-sm text-muted-foreground">
          {m.route_procedures_the_sending_facility_keeps_their_own()}
        </p>
        {receiptSaved && <p className="text-xs text-muted-foreground">{m.route_procedures_saved_to({ receiptSaved })}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveReceipt}>{m.route_procedures_save_the_receipt_file()}</Button>
          {transfer?.prisonerId && (
            <Link to="/prisoners/$prisonerId" params={{ prisonerId: transfer.prisonerId }} className={buttonVariants({ variant: 'secondary' })}>
              {m.route_procedures_open_the_prisoner_file()}
            </Link>
          )}
        </div>
      </article>
    )
  }

  const steps: ProcedureStep[] = [
    { id: 'review', label: m.route_procedures_review_the_dossier(), summary: m.route_procedures_from_facility({ facility: dossier.fromFacility }), done: step !== 'review' },
    { id: 'identity', label: m.route_procedures_verify_identity(), done: identityVerified, summary: identityVerified ? m.route_procedures_matches_the_dossier() : null },
    { id: 'property', label: m.route_procedures_reconcile_property(), done: dossier.property.length === 0 || step === 'place', summary: m.route_procedures_n_of_m_received({ received: dossier.property.length - missing.length, total: dossier.property.length }) },
    { id: 'place', label: m.route_procedures_place_and_confirm(), done: false, summary: placement || null },
  ]

  return (
    <ProcedureShell
      title={m.route_procedures_arrival()}
      description={m.route_procedures_accept_the_person_only_if_they()}
      backTo="/movements"
      backLabel={m.route_procedures_back_to_movements()}
      steps={steps}
      current={step}
      onSelect={(id) => setStep(id as StepId)}
      aside={
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3 text-sm">
          <span className="font-medium">{prisonerFullName({ firstName: p.firstName, lastName: p.lastName, otherNames: p.otherNames })}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(p.status)}</Badge>
            {dossier.returning && <Badge variant="outline">{m.route_procedures_returning_earlier_record_here()}</Badge>}
            {p.documentsPending && <Badge variant="destructive">{m.route_procedures_documents_pending()}</Badge>}
          </div>
        </div>
      }
    >
      {step === 'review' && (
        <div className="flex flex-col gap-5">
          <h2 className="text-base font-medium">{m.route_procedures_the_dossier()}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label={m.route_procedures_sent_by()}>{dossier.fromFacility}</Row>
            <Row label={m.route_procedures_departed()}>{format(dossier.departedAt, 'PPp')}</Row>
            <Row label={m.route_procedures_order()}>{dossier.orderReference ?? dossier.orderingAuthority}</Row>
            <Row label={m.route_procedures_legal_category()}>{prisonerStatusLabel(p.status)}</Row>
            <Row label={m.route_procedures_offence()}>{p.offence}</Row>
            <Row label={m.route_procedures_originally_admitted()}>{format(p.admittedAt, 'PP')}</Row>
            <Row label={m.route_procedures_national_id()}>{p.nationalId}</Row>
            <Row label={m.route_procedures_date_of_birth()}>{p.dateOfBirth ? format(p.dateOfBirth, 'PP') : null}</Row>
            <Row label={m.route_procedures_sex()}>{p.sex}</Row>
            <Row label={m.route_procedures_sentence()}>
              {dossier.sentence
                ? dossier.sentence.isLife
                  ? m.route_procedures_life_from({ startsOn: format(dossier.sentence.startsOn, 'PP') })
                  : `${[dossier.sentence.termYears && `${dossier.sentence.termYears} y`, dossier.sentence.termMonths && `${dossier.sentence.termMonths} m`, dossier.sentence.termDays && `${dossier.sentence.termDays} d`].filter(Boolean).join(' ')}, from ${format(dossier.sentence.startsOn, 'PP')}`
                : null}
            </Row>
          </dl>

          <Block title={m.route_procedures_legal_instruments()}>
            {dossier.instruments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.route_procedures_none_in_the_dossier()}</p>
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
            {dossier.fileNames.length > 0 && <p className="text-xs text-muted-foreground">{m.route_procedures_documents_that_will_be_filed({ join: dossier.fileNames.join(', ') })}</p>}
          </Block>

          <Block title={m.route_procedures_court_productions_carried_over()}>
            {dossier.scheduledProductions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.route_procedures_none_scheduled()}</p>
            ) : (
              <ul className="text-sm">
                {dossier.scheduledProductions.map((production, index) => (
                  <li key={index}>
                    {format(production.productionDate, 'PPp')}, {production.courtReference ?? m.route_procedures_court()} ({production.productionMethod})
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={m.route_procedures_contacts()}>
            {dossier.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.route_procedures_none_recorded()}</p>
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

          <Block title={m.route_procedures_what_the_sender_did_before_dispatch()}>
            <p className="text-sm text-muted-foreground">
              {Object.entries(dossier.checklist)
                .filter(([key, value]) => key !== 'note' && value === true)
                .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase())
                .join(', ') || m.route_procedures_nothing_was_ticked_off()}
              {dossier.checklist.note ? m.route_procedures_note_2({ note: dossier.checklist.note }) : ''}
            </p>
          </Block>
          <div>
            <Button onClick={() => setStep('identity')}>{m.route_procedures_continue_to_identity()}</Button>
          </div>
        </div>
      )}

      {step === 'identity' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.route_procedures_verify_identity()}</h2>
          <p className="text-sm text-muted-foreground">
            {m.route_procedures_compare_the_person_in_front_of()}
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-0.5" checked={identityVerified} onCheckedChange={(checked) => setIdentityVerified(checked === true)} />{m.route_procedures_i_have_checked_this_person_against()}
          </label>
          <Field>
            <FieldLabel>{m.route_procedures_discrepancies_noticed_optional()}</FieldLabel>
            <Textarea value={discrepancyNote} onChange={(e) => setDiscrepancyNote(e.target.value)} placeholder={m.route_procedures_anything_that_differs_from_the_dossier()} />
          </Field>
          <div>
            <Button onClick={() => setStep('property')} disabled={!identityVerified}>
              {m.route_procedures_continue_to_property()}
            </Button>
          </div>
        </div>
      )}

      {step === 'property' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.route_procedures_reconcile_property()}</h2>
          {dossier.property.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.route_procedures_the_dossier_lists_no_property()}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{m.route_procedures_tick_each_item_that_arrived_items()}</p>
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
              {missing.length > 0 && <p className="text-xs text-destructive">{m.route_procedures_item_s_will_be_reported_as({ length: missing.length })}</p>}
            </>
          )}
          <div>
            <Button onClick={() => setStep('place')}>{m.route_procedures_continue_to_placement()}</Button>
          </div>
        </div>
      )}

      {step === 'place' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.route_procedures_place_and_confirm()}</h2>
          <Field>
            <FieldLabel>{m.route_procedures_accommodation()}</FieldLabel>
            <Input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder={m.route_procedures_ward_cell()} />
          </Field>
          <Field>
            <FieldLabel>{m.route_procedures_health_screening_note_optional()}</FieldLabel>
            <Textarea value={healthScreenNote} onChange={(e) => setHealthScreenNote(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m.route_procedures_received_at()}</FieldLabel>
            <Input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
          {!identityVerified && <p className="text-xs text-destructive">{m.route_procedures_verify_identity_before_confirming()}</p>}
          <div>
            <Button onClick={submit} disabled={!identityVerified || confirm.isPending}>
              {m.route_procedures_confirm_arrival_and_save_the_receipt()}
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
      <dd>{children || m.route_procedures_not_recorded()}</dd>
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
