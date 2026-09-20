import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import { ApiError } from '@/lib/api'
import { toDateInput, toDatetimeLocal } from '@/lib/datetime'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { admissionInstrumentLabel, prisonerStatusLabel } from '@/features/prisoners/schema'
import { useReceivePerson } from './queries'
import {
  ContactsStep,
  DecisionStep,
  HealthStep,
  InstrumentStep,
  PersonStep,
  PlacementStep,
  PropertyStep,
  SearchStep,
} from './reception-steps'
import { PhotosStep } from './photos-step'
import type { ReceptionDraft } from './schema'
import { m } from '@/paraglide/messages'

function initialDraft(): ReceptionDraft {
  const now = Date.now()
  return {
    receivedAt: toDatetimeLocal(now),
    instrumentKind: '',
    issuingAuthority: '',
    instrumentReference: '',
    issuedOn: '',
    authenticated: false,
    verificationNote: '',
    firstName: '',
    lastName: '',
    otherNames: '',
    nationalId: '',
    reference: '',
    photos: { front: null, left: null, right: null },
    sex: '',
    dateOfBirth: '',
    nationality: '',
    educationLevel: '',
    legalStatus: 'unconvicted',
    offence: '',
    highCourtOnly: false,
    isLife: false,
    termYears: '',
    termMonths: '',
    termDays: '',
    sentenceStartsOn: toDateInput(now),
    searchDone: false,
    injuriesNote: '',
    complaintsNote: '',
    property: [],
    contacts: [],
    healthScreenNote: '',
    rulesInformationGiven: false,
    placement: '',
    notes: '',
    decision: 'accept',
    pendingDocumentType: '',
    refusalGround: '',
    decisionReason: '',
  }
}

const STEP_ORDER = ['instrument', 'person', 'photos', 'search', 'property', 'contacts', 'health', 'placement', 'decision'] as const
type StepId = (typeof STEP_ORDER)[number]

function fullName(d: ReceptionDraft) {
  return [d.lastName.trim(), d.firstName.trim(), d.otherNames.trim()].filter(Boolean).join(', ')
}

function photoCount(d: ReceptionDraft) {
  return [d.photos.front, d.photos.left, d.photos.right].filter(Boolean).length
}

function sentenceEntered(d: ReceptionDraft) {
  return d.isLife || (Number(d.termYears) || 0) + (Number(d.termMonths) || 0) + (Number(d.termDays) || 0) > 0
}

/** What still blocks the chosen decision from being recorded. */
function problemsFor(d: ReceptionDraft): string[] {
  const problems: string[] = []
  if (!d.firstName.trim() || !d.lastName.trim()) problems.push(m.reception_enter_the_first_and_last_name())
  if (d.decision === 'refuse') {
    if (!d.decisionReason.trim()) problems.push(m.reception_record_why_reception_is_refused())
    return problems
  }
  if (!d.instrumentKind) problems.push(m.reception_choose_the_instrument_the_person_arrived())
  if (d.decision === 'accept' && !d.authenticated) {
    problems.push(m.reception_the_instrument_is_not_marked_as())
  }
  if (d.decision === 'accept_pending' && !d.pendingDocumentType) problems.push(m.reception_say_which_document_is_still_pending())
  return problems
}

/**
 * Reception (docs/prisons/product-map/02 W1): the procedure that causes the
 * admission record. Verify the instrument, decide, then search, inventory,
 * screen, inform and place, recorded in one step by the node.
 */
export function ReceptionProcedure() {
  const navigate = useNavigate()
  const receive = useReceivePerson()
  const [draft, setDraft] = useState<ReceptionDraft>(initialDraft)
  const [current, setCurrent] = useState<StepId>('instrument')

  const set = <K extends keyof ReceptionDraft>(key: K, value: ReceptionDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }))

  const problems = useMemo(() => problemsFor(draft), [draft])
  const name = fullName(draft)

  const steps: ProcedureStep[] = [
    {
      id: 'instrument',
      label: m.reception_instrument(),
      done: Boolean(draft.instrumentKind) && draft.authenticated,
      summary: draft.instrumentKind ? `${admissionInstrumentLabel(draft.instrumentKind)}${draft.authenticated ? ', verified' : ', not verified'}` : null,
    },
    {
      id: 'person',
      label: m.reception_person(),
      done: Boolean(draft.firstName.trim() && draft.lastName.trim()) && (draft.legalStatus !== 'convicted' || sentenceEntered(draft)),
      summary: name || null,
    },
    {
      id: 'photos',
      label: m.reception_photos(),
      optional: true,
      done: photoCount(draft) === 3,
      summary: photoCount(draft) ? `${photoCount(draft)} of 3 taken` : null,
    },
    { id: 'search', label: m.reception_search_and_condition(), done: draft.searchDone, summary: draft.searchDone ? m.reception_search_done() : null },
    { id: 'property', label: m.reception_property(), optional: true, done: draft.property.some((p) => p.trim()), summary: draft.property.filter((p) => p.trim()).length ? `${draft.property.filter((p) => p.trim()).length} item(s)` : null },
    { id: 'contacts', label: m.reception_family_and_contacts(), optional: true, done: draft.contacts.some((c) => c.name.trim()), summary: draft.contacts.filter((c) => c.name.trim()).length ? `${draft.contacts.filter((c) => c.name.trim()).length} contact(s)` : null },
    { id: 'health', label: m.reception_health_and_information(), done: draft.rulesInformationGiven, summary: draft.rulesInformationGiven ? m.reception_information_given() : null },
    { id: 'placement', label: m.reception_placement(), optional: true, done: Boolean(draft.placement.trim()), summary: draft.placement.trim() || null },
    { id: 'decision', label: m.reception_decision(), done: false },
  ]

  const index = STEP_ORDER.indexOf(current)
  const last = index === STEP_ORDER.length - 1

  const submit = async () => {
    if (problems.length > 0) return
    try {
      const result = await receive.mutateAsync(draft)
      if (result.prisoner) {
        t.success(m.reception_person_received(), { description: name })
        navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: result.prisoner.id } })
      } else {
        t.success(m.reception_refusal_recorded(), { description: name })
        navigate({ to: '/movements' as never })
      }
    } catch (error) {
      t.error(m.reception_could_not_record_reception(), {
        description: error instanceof ApiError ? error.message : m.reception_please_try_again(),
      })
    }
  }

  const submitLabel = draft.decision === 'refuse' ? m.reception_record_refusal() : draft.decision === 'accept_pending' ? m.reception_accept_document_pending() : m.reception_accept_and_receive()

  return (
    <ProcedureShell
      title={m.reception_reception()}
      description={m.reception_receive_a_person_under_a_legal()}
      backTo="/movements"
      backLabel={m.reception_back_to_movements()}
      steps={steps}
      current={current}
      onSelect={(id) => setCurrent(id as StepId)}
      aside={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{m.reception_receiving()}</span>
          <span className="text-sm font-medium">{name || m.reception_name_not_entered_yet()}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(draft.legalStatus)}</Badge>
            {!draft.authenticated && <Badge variant="destructive">{m.reception_instrument_not_verified()}</Badge>}
          </div>
        </div>
      }
    >
      {current === 'instrument' && <InstrumentStep draft={draft} set={set} />}
      {current === 'person' && <PersonStep draft={draft} set={set} />}
      {current === 'photos' && <PhotosStep draft={draft} set={set} />}
      {current === 'search' && <SearchStep draft={draft} set={set} />}
      {current === 'property' && <PropertyStep draft={draft} set={set} />}
      {current === 'contacts' && <ContactsStep draft={draft} set={set} />}
      {current === 'health' && <HealthStep draft={draft} set={set} />}
      {current === 'placement' && <PlacementStep draft={draft} set={set} />}
      {current === 'decision' && <DecisionStep draft={draft} set={set} problems={problems} />}

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" disabled={index === 0} onClick={() => setCurrent(STEP_ORDER[index - 1])}>
          {m.reception_back()}
        </Button>
        {last ? (
          <Button type="button" disabled={problems.length > 0 || receive.isPending} onClick={submit} variant={draft.decision === 'refuse' ? 'destructive' : 'default'}>
            {receive.isPending ? m.reception_recording() : submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={() => setCurrent(STEP_ORDER[index + 1])}>
            {m.reception_next()}
          </Button>
        )}
      </div>
    </ProcedureShell>
  )
}
