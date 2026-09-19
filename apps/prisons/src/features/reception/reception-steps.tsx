import { admissionInstrumentTypes, educationLevels, nationalities, pendingDocumentTypes, prisonerSexes, prisonerStatuses } from '@/features/prisoners/schema'
import { AddCircleIcon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { AreaField, SelectField, SwitchField, TextField } from '@/components/form-fields'
import {
  contactRelationships,
  emptyContact,
  receptionDecisions,
  refusalGrounds,
  type ContactDraft,
  type ReceptionDraft,
} from './schema'

export type StepProps = {
  draft: ReceptionDraft
  set: <K extends keyof ReceptionDraft>(key: K, value: ReceptionDraft[K]) => void
}

export function InstrumentStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title="Instrument" description="Verify the document the person arrived under (s.58). Check the court seal or the authorised signature, and that the particulars match the person." />
      <SelectField
        label="Instrument type"
        value={draft.instrumentKind}
        onChange={(v) => set('instrumentKind', v)}
        options={admissionInstrumentTypes}
        placeholder="Select the instrument"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Issuing court or authority" value={draft.issuingAuthority} onChange={(v) => set('issuingAuthority', v)} placeholder="e.g. Jinja Chief Magistrate's Court" />
        <TextField label="Instrument reference" value={draft.instrumentReference} onChange={(v) => set('instrumentReference', v)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Date issued" type="date" value={draft.issuedOn} onChange={(v) => set('issuedOn', v)} />
        <TextField label="Received at" type="datetime-local" value={draft.receivedAt} onChange={(v) => set('receivedAt', v)} />
      </div>
      <SwitchField
        label="Seal or signature verified, particulars match"
        checked={draft.authenticated}
        onChange={(v) => set('authenticated', v)}
        description="Required to accept. Without it, the person can only be accepted with the document pending, or refused."
      />
      <AreaField label="Verification note" value={draft.verificationNote} onChange={(v) => set('verificationNote', v)} placeholder="Who signed, which seal, any discrepancy noticed" />
    </>
  )
}

export function PersonStep({ draft, set }: StepProps) {
  const convicted = draft.legalStatus === 'convicted'
  return (
    <>
      <StepHeading title="Person" description="Identity and the legal category the person is held under." />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="First name" value={draft.firstName} onChange={(v) => set('firstName', v)} autoFocus autoComplete="given-name" />
        <TextField label="Last name" value={draft.lastName} onChange={(v) => set('lastName', v)} autoComplete="family-name" />
      </div>
      <TextField label="Other names" value={draft.otherNames} onChange={(v) => set('otherNames', v)} autoComplete="additional-name" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="National ID" value={draft.nationalId} onChange={(v) => set('nationalId', v)} autoComplete="off" />
        <TextField label="Reference" value={draft.reference} onChange={(v) => set('reference', v)} autoComplete="off" description="No standard prisoner number format was confirmed in research." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Date of birth" type="date" value={draft.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} autoComplete="bday" />
        <SelectField label="Sex" value={draft.sex} onChange={(v) => set('sex', v)} options={prisonerSexes} placeholder="Select sex" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Nationality" value={draft.nationality} onChange={(v) => set('nationality', v)} options={nationalities} placeholder="Select nationality" />
        <SelectField label="Education level" value={draft.educationLevel} onChange={(v) => set('educationLevel', v)} options={educationLevels} placeholder="Select level" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Legal category" value={draft.legalStatus} onChange={(v) => set('legalStatus', v)} options={prisonerStatuses} placeholder="Select category" />
        <TextField label="Offence or charge" value={draft.offence} onChange={(v) => set('offence', v)} autoComplete="off" placeholder="e.g. Aggravated robbery" />
      </div>
      <SwitchField
        label="Offence triable only by the High Court"
        checked={draft.highCourtOnly}
        onChange={(v) => set('highCourtOnly', v)}
        description="Sets the mandatory-bail threshold: 180 days if High Court only, otherwise 60 days (Art. 23(6))."
      />

      {convicted && (
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Sentence</span>
            <span className="text-xs text-muted-foreground">Dates are computed from this and shown as computed. Check them against the warrant.</span>
          </div>
          <SwitchField label="Life sentence" checked={draft.isLife} onChange={(v) => set('isLife', v)} />
          {!draft.isLife && (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Years" type="number" value={draft.termYears} onChange={(v) => set('termYears', v)} />
              <TextField label="Months" type="number" value={draft.termMonths} onChange={(v) => set('termMonths', v)} />
              <TextField label="Days" type="number" value={draft.termDays} onChange={(v) => set('termDays', v)} />
            </div>
          )}
          <TextField
            label="Sentence starts on"
            type="date"
            value={draft.sentenceStartsOn}
            onChange={(v) => set('sentenceStartsOn', v)}
            description="Defaults to the date received. Change it if the warrant counts from an earlier date."
          />
        </div>
      )}
    </>
  )
}

export function SearchStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title="Search and condition" description="Search on reception (s.62(1)) and the person's visible condition." />
      <SwitchField label="Search carried out" checked={draft.searchDone} onChange={(v) => set('searchDone', v)} />
      <AreaField label="Visible injuries" value={draft.injuriesNote} onChange={(v) => set('injuriesNote', v)} placeholder="Describe any visible injury, or write none observed" />
      <AreaField
        label="Complaint of ill-treatment before arrival"
        value={draft.complaintsNote}
        onChange={(v) => set('complaintsNote', v)}
        placeholder="Record what the person says, in their words"
        description="Record the complaint as made. Do not assess it here."
      />
    </>
  )
}

export function PropertyStep({ draft, set }: StepProps) {
  const update = (index: number, value: string) => set('property', draft.property.map((line, i) => (i === index ? value : line)))
  return (
    <>
      <StepHeading title="Property" description="Money, clothes and effects taken into the Officer in Charge's custody (s.62). One line for each item." />
      <div className="flex flex-col gap-2">
        {draft.property.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              className="min-w-0 flex-1"
              value={line}
              placeholder="e.g. Cash UGX 45,000"
              autoFocus={index === draft.property.length - 1 && line === ''}
              onChange={(e) => update(index, e.target.value)}
            />
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove item" onClick={() => set('property', draft.property.filter((_, i) => i !== index))}>
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        ))}
        {draft.property.length === 0 && <p className="text-sm text-muted-foreground">No property listed yet.</p>}
      </div>
      <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => set('property', [...draft.property, ''])}>
        <HugeiconsIcon icon={AddCircleIcon} />
        Add item
      </Button>
    </>
  )
}

export function ContactsStep({ draft, set }: StepProps) {
  const update = (index: number, patch: Partial<ContactDraft>) => set('contacts', draft.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  return (
    <>
      <StepHeading title="Family and contacts" description="Next of kin and emergency contacts. Offer to notify them of the imprisonment." />
      <div className="flex flex-col gap-3">
        {draft.contacts.map((contact, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Name" value={contact.name} onChange={(v) => update(index, { name: v })} autoFocus={contact.name === ''} />
              <SelectField label="Relationship" value={contact.relationship} onChange={(v) => update(index, { relationship: v })} options={contactRelationships} placeholder="Select" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Phone" value={contact.phone} onChange={(v) => update(index, { phone: v })} />
              <TextField label="Address" value={contact.address} onChange={(v) => update(index, { address: v })} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <SwitchField label="Emergency contact" checked={contact.isEmergency} onChange={(v) => update(index, { isEmergency: v })} />
                <SwitchField label="Notify of imprisonment" checked={contact.notifyOnImprisonment} onChange={(v) => update(index, { notifyOnImprisonment: v })} />
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => set('contacts', draft.contacts.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        {draft.contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts recorded yet.</p>}
      </div>
      <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => set('contacts', [...draft.contacts, emptyContact()])}>
        <HugeiconsIcon icon={AddCircleIcon} />
        Add contact
      </Button>
    </>
  )
}

export function HealthStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title="Health and information" description="Health screening as soon as possible, and the written information the person must receive." />
      <AreaField label="Health screening note" value={draft.healthScreenNote} onChange={(v) => set('healthScreenNote', v)} placeholder="Who screened, and anything that needs follow-up" description="Coordination only. Clinical detail is not kept here." />
      <SwitchField
        label="Written information given"
        checked={draft.rulesInformationGiven}
        onChange={(v) => set('rulesInformationGiven', v)}
        description="Rules, discipline and the complaints procedure (s.58(5))."
      />
    </>
  )
}

export function PlacementStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title="Placement" description="Where the person is accommodated. Check separation rules for category, sex and age." />
      <TextField label="Location" value={draft.placement} onChange={(v) => set('placement', v)} placeholder="e.g. Ward 3, cell 2" autoFocus />
      <AreaField label="Notes" value={draft.notes} onChange={(v) => set('notes', v)} placeholder="Anything else the next officer should know" />
    </>
  )
}

export function DecisionStep({ draft, set, problems }: StepProps & { problems: string[] }) {
  return (
    <>
      <StepHeading title="Decision" description="Accept, accept with a document pending, or refuse. This is recorded with your name." />
      <div className="grid gap-2 sm:grid-cols-3">
        {receptionDecisions.map((option) => {
          const active = draft.decision === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => set('decision', option.value)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
                active ? 'border-primary/50 bg-primary/5' : 'border-border/60',
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </button>
          )
        })}
      </div>

      {draft.decision === 'accept_pending' && (
        <SelectField
          label="Which document is pending"
          value={draft.pendingDocumentType}
          onChange={(v) => set('pendingDocumentType', v)}
          options={pendingDocumentTypes}
          placeholder="Select the document"
          description="It becomes an open item on Today until the instrument is recorded."
        />
      )}

      {draft.decision === 'refuse' && (
        <>
          <SelectField label="Ground for refusal" value={draft.refusalGround} onChange={(v) => set('refusalGround', v)} options={refusalGrounds} placeholder="Select the ground" />
          <AreaField label="Reason" value={draft.decisionReason} onChange={(v) => set('decisionReason', v)} placeholder="Say exactly why reception is refused" />
        </>
      )}

      {problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">Before this can be recorded:</p>
          <ul className="list-disc pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground md:max-w-xl">{description}</p>
    </div>
  )
}
