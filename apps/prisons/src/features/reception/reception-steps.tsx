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
import { m } from '@/paraglide/messages'

export type StepProps = {
  draft: ReceptionDraft
  set: <K extends keyof ReceptionDraft>(key: K, value: ReceptionDraft[K]) => void
}

export function InstrumentStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title={m.reception_instrument()} description={m.reception_verify_the_document_the_person_arrived()} />
      <SelectField
        label={m.reception_instrument_type()}
        value={draft.instrumentKind}
        onChange={(v) => set('instrumentKind', v)}
        options={admissionInstrumentTypes}
        placeholder={m.reception_select_the_instrument()}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={m.reception_issuing_court_or_authority()} value={draft.issuingAuthority} onChange={(v) => set('issuingAuthority', v)} placeholder={m.reception_e_g_jinja_chief_magistrate_s()} />
        <TextField label={m.reception_instrument_reference()} value={draft.instrumentReference} onChange={(v) => set('instrumentReference', v)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={m.reception_date_issued()} type="date" value={draft.issuedOn} onChange={(v) => set('issuedOn', v)} />
        <TextField label={m.reception_received_at()} type="datetime-local" value={draft.receivedAt} onChange={(v) => set('receivedAt', v)} />
      </div>
      <SwitchField
        label={m.reception_seal_or_signature_verified_particulars_m()}
        checked={draft.authenticated}
        onChange={(v) => set('authenticated', v)}
        description={m.reception_required_to_accept_without_it_the()}
      />
      <AreaField label={m.reception_verification_note()} value={draft.verificationNote} onChange={(v) => set('verificationNote', v)} placeholder={m.reception_who_signed_which_seal_any_discrepancy()} />
    </>
  )
}

export function PersonStep({ draft, set }: StepProps) {
  const convicted = draft.legalStatus === 'convicted'
  return (
    <>
      <StepHeading title={m.reception_person()} description={m.reception_identity_and_the_legal_category_the()} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={m.reception_first_name()} value={draft.firstName} onChange={(v) => set('firstName', v)} autoFocus autoComplete="given-name" />
        <TextField label={m.reception_last_name()} value={draft.lastName} onChange={(v) => set('lastName', v)} autoComplete="family-name" />
      </div>
      <TextField label={m.reception_other_names()} value={draft.otherNames} onChange={(v) => set('otherNames', v)} autoComplete="additional-name" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={m.reception_national_id()} value={draft.nationalId} onChange={(v) => set('nationalId', v)} autoComplete="off" />
        <TextField label={m.reception_reference()} value={draft.reference} onChange={(v) => set('reference', v)} autoComplete="off" description={m.reception_no_standard_prisoner_number_format_was()} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={m.reception_date_of_birth()} type="date" value={draft.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} autoComplete="bday" />
        <SelectField label={m.reception_sex()} value={draft.sex} onChange={(v) => set('sex', v)} options={prisonerSexes} placeholder={m.reception_select_sex()} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={m.reception_nationality()} value={draft.nationality} onChange={(v) => set('nationality', v)} options={nationalities} placeholder={m.reception_select_nationality()} />
        <SelectField label={m.reception_education_level()} value={draft.educationLevel} onChange={(v) => set('educationLevel', v)} options={educationLevels} placeholder={m.reception_select_level()} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={m.reception_legal_category()} value={draft.legalStatus} onChange={(v) => set('legalStatus', v)} options={prisonerStatuses} placeholder={m.reception_select_category()} />
        <TextField label={m.reception_offence_or_charge()} value={draft.offence} onChange={(v) => set('offence', v)} autoComplete="off" placeholder={m.reception_e_g_aggravated_robbery()} />
      </div>
      <SwitchField
        label={m.reception_offence_triable_only_by_the_high()}
        checked={draft.highCourtOnly}
        onChange={(v) => set('highCourtOnly', v)}
        description={m.reception_sets_the_mandatory_bail_threshold_180()}
      />

      {convicted && (
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{m.reception_sentence()}</span>
            <span className="text-xs text-muted-foreground">{m.reception_dates_are_computed_from_this_and()}</span>
          </div>
          <SwitchField label={m.reception_life_sentence()} checked={draft.isLife} onChange={(v) => set('isLife', v)} />
          {!draft.isLife && (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label={m.reception_years()} type="number" value={draft.termYears} onChange={(v) => set('termYears', v)} />
              <TextField label={m.reception_months()} type="number" value={draft.termMonths} onChange={(v) => set('termMonths', v)} />
              <TextField label={m.reception_days()} type="number" value={draft.termDays} onChange={(v) => set('termDays', v)} />
            </div>
          )}
          <TextField
            label={m.reception_sentence_starts_on()}
            type="date"
            value={draft.sentenceStartsOn}
            onChange={(v) => set('sentenceStartsOn', v)}
            description={m.reception_defaults_to_the_date_received_change()}
          />
        </div>
      )}
    </>
  )
}

export function SearchStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title={m.reception_search_and_condition()} description={m.reception_search_on_reception_s_62_1()} />
      <SwitchField label={m.reception_search_carried_out()} checked={draft.searchDone} onChange={(v) => set('searchDone', v)} />
      <AreaField label={m.reception_visible_injuries()} value={draft.injuriesNote} onChange={(v) => set('injuriesNote', v)} placeholder={m.reception_describe_any_visible_injury_or_write()} />
      <AreaField
        label={m.reception_complaint_of_ill_treatment_before_arriva()}
        value={draft.complaintsNote}
        onChange={(v) => set('complaintsNote', v)}
        placeholder={m.reception_record_what_the_person_says_in()}
        description={m.reception_record_the_complaint_as_made_do()}
      />
    </>
  )
}

export function PropertyStep({ draft, set }: StepProps) {
  const update = (index: number, value: string) => set('property', draft.property.map((line, i) => (i === index ? value : line)))
  return (
    <>
      <StepHeading title={m.reception_property()} description={m.reception_money_clothes_and_effects_taken_into()} />
      <div className="flex flex-col gap-2">
        {draft.property.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              className="min-w-0 flex-1"
              value={line}
              placeholder={m.reception_e_g_cash_ugx_45_000()}
              autoFocus={index === draft.property.length - 1 && line === ''}
              onChange={(e) => update(index, e.target.value)}
            />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={m.reception_remove_item()} onClick={() => set('property', draft.property.filter((_, i) => i !== index))}>
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        ))}
        {draft.property.length === 0 && <p className="text-sm text-muted-foreground">{m.reception_no_property_listed_yet()}</p>}
      </div>
      <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => set('property', [...draft.property, ''])}>
        <HugeiconsIcon icon={AddCircleIcon} />
        {m.reception_add_item()}
      </Button>
    </>
  )
}

export function ContactsStep({ draft, set }: StepProps) {
  const update = (index: number, patch: Partial<ContactDraft>) => set('contacts', draft.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  return (
    <>
      <StepHeading title={m.reception_family_and_contacts()} description={m.reception_next_of_kin_and_emergency_contacts()} />
      <div className="flex flex-col gap-3">
        {draft.contacts.map((contact, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={m.reception_name()} value={contact.name} onChange={(v) => update(index, { name: v })} autoFocus={contact.name === ''} />
              <SelectField label={m.reception_relationship()} value={contact.relationship} onChange={(v) => update(index, { relationship: v })} options={contactRelationships} placeholder={m.reception_select()} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={m.reception_phone()} value={contact.phone} onChange={(v) => update(index, { phone: v })} />
              <TextField label={m.reception_address()} value={contact.address} onChange={(v) => update(index, { address: v })} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <SwitchField label={m.reception_emergency_contact()} checked={contact.isEmergency} onChange={(v) => update(index, { isEmergency: v })} />
                <SwitchField label={m.reception_notify_of_imprisonment()} checked={contact.notifyOnImprisonment} onChange={(v) => update(index, { notifyOnImprisonment: v })} />
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => set('contacts', draft.contacts.filter((_, i) => i !== index))}>
                {m.reception_remove()}
              </Button>
            </div>
          </div>
        ))}
        {draft.contacts.length === 0 && <p className="text-sm text-muted-foreground">{m.reception_no_contacts_recorded_yet()}</p>}
      </div>
      <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => set('contacts', [...draft.contacts, emptyContact()])}>
        <HugeiconsIcon icon={AddCircleIcon} />
        {m.reception_add_contact()}
      </Button>
    </>
  )
}

export function HealthStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title={m.reception_health_and_information()} description={m.reception_health_screening_as_soon_as_possible()} />
      <AreaField label={m.reception_health_screening_note()} value={draft.healthScreenNote} onChange={(v) => set('healthScreenNote', v)} placeholder={m.reception_who_screened_and_anything_that_needs()} description={m.reception_coordination_only_clinical_detail_is_not()} />
      <SwitchField
        label={m.reception_written_information_given()}
        checked={draft.rulesInformationGiven}
        onChange={(v) => set('rulesInformationGiven', v)}
        description={m.reception_rules_discipline_and_the_complaints_proc()}
      />
    </>
  )
}

export function PlacementStep({ draft, set }: StepProps) {
  return (
    <>
      <StepHeading title={m.reception_placement()} description={m.reception_where_the_person_is_accommodated_check()} />
      <TextField label={m.reception_location()} value={draft.placement} onChange={(v) => set('placement', v)} placeholder={m.reception_e_g_ward_3_cell_2()} autoFocus />
      <AreaField label={m.reception_notes()} value={draft.notes} onChange={(v) => set('notes', v)} placeholder={m.reception_anything_else_the_next_officer_should()} />
    </>
  )
}

export function DecisionStep({ draft, set, problems }: StepProps & { problems: string[] }) {
  return (
    <>
      <StepHeading title={m.reception_decision()} description={m.reception_accept_accept_with_a_document_pending()} />
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
          label={m.reception_which_document_is_pending()}
          value={draft.pendingDocumentType}
          onChange={(v) => set('pendingDocumentType', v)}
          options={pendingDocumentTypes}
          placeholder={m.reception_select_the_document()}
          description={m.reception_it_becomes_an_open_item_on()}
        />
      )}

      {draft.decision === 'refuse' && (
        <>
          <SelectField label={m.reception_ground_for_refusal()} value={draft.refusalGround} onChange={(v) => set('refusalGround', v)} options={refusalGrounds} placeholder={m.reception_select_the_ground()} />
          <AreaField label={m.reception_reason()} value={draft.decisionReason} onChange={(v) => set('decisionReason', v)} placeholder={m.reception_say_exactly_why_reception_is_refused()} />
        </>
      )}

      {problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">{m.reception_before_this_can_be_recorded()}</p>
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
