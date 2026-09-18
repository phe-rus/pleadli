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
import type { ReceptionDraft } from './schema'

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

const STEP_ORDER = ['instrument', 'person', 'search', 'property', 'contacts', 'health', 'placement', 'decision'] as const
type StepId = (typeof STEP_ORDER)[number]

function fullName(d: ReceptionDraft) {
  return [d.lastName.trim(), d.firstName.trim(), d.otherNames.trim()].filter(Boolean).join(', ')
}

function sentenceEntered(d: ReceptionDraft) {
  return d.isLife || (Number(d.termYears) || 0) + (Number(d.termMonths) || 0) + (Number(d.termDays) || 0) > 0
}

/** What still blocks the chosen decision from being recorded. */
function problemsFor(d: ReceptionDraft): string[] {
  const problems: string[] = []
  if (!d.firstName.trim() || !d.lastName.trim()) problems.push('Enter the first and last name on the Person step.')
  if (d.decision === 'refuse') {
    if (!d.decisionReason.trim()) problems.push('Record why reception is refused.')
    return problems
  }
  if (!d.instrumentKind) problems.push('Choose the instrument the person arrived under.')
  if (d.decision === 'accept' && !d.authenticated) {
    problems.push('The instrument is not marked as verified. Verify it, or accept with the document pending.')
  }
  if (d.decision === 'accept_pending' && !d.pendingDocumentType) problems.push('Say which document is still pending.')
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
      label: 'Instrument',
      done: Boolean(draft.instrumentKind) && draft.authenticated,
      summary: draft.instrumentKind ? `${admissionInstrumentLabel(draft.instrumentKind)}${draft.authenticated ? ', verified' : ', not verified'}` : null,
    },
    {
      id: 'person',
      label: 'Person',
      done: Boolean(draft.firstName.trim() && draft.lastName.trim()) && (draft.legalStatus !== 'convicted' || sentenceEntered(draft)),
      summary: name || null,
    },
    { id: 'search', label: 'Search and condition', done: draft.searchDone, summary: draft.searchDone ? 'Search done' : null },
    { id: 'property', label: 'Property', optional: true, done: draft.property.some((p) => p.trim()), summary: draft.property.filter((p) => p.trim()).length ? `${draft.property.filter((p) => p.trim()).length} item(s)` : null },
    { id: 'contacts', label: 'Family and contacts', optional: true, done: draft.contacts.some((c) => c.name.trim()), summary: draft.contacts.filter((c) => c.name.trim()).length ? `${draft.contacts.filter((c) => c.name.trim()).length} contact(s)` : null },
    { id: 'health', label: 'Health and information', done: draft.rulesInformationGiven, summary: draft.rulesInformationGiven ? 'Information given' : null },
    { id: 'placement', label: 'Placement', optional: true, done: Boolean(draft.placement.trim()), summary: draft.placement.trim() || null },
    { id: 'decision', label: 'Decision', done: false },
  ]

  const index = STEP_ORDER.indexOf(current)
  const last = index === STEP_ORDER.length - 1

  const submit = async () => {
    if (problems.length > 0) return
    try {
      const result = await receive.mutateAsync(draft)
      if (result.prisoner) {
        t.success('Person received', { description: name })
        navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: result.prisoner.id } })
      } else {
        t.success('Refusal recorded', { description: name })
        navigate({ to: '/movements' as never })
      }
    } catch (error) {
      t.error('Could not record reception', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      })
    }
  }

  const submitLabel = draft.decision === 'refuse' ? 'Record refusal' : draft.decision === 'accept_pending' ? 'Accept, document pending' : 'Accept and receive'

  return (
    <ProcedureShell
      title="Reception"
      description="Receive a person under a legal instrument. Nothing is recorded until you make the decision on the last step."
      backTo="/movements"
      backLabel="Back to Movements"
      steps={steps}
      current={current}
      onSelect={(id) => setCurrent(id as StepId)}
      aside={
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 text-xs">
          <span className="text-muted-foreground">Receiving</span>
          <span className="text-sm font-medium">{name || 'Name not entered yet'}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(draft.legalStatus)}</Badge>
            {!draft.authenticated && <Badge variant="destructive">Instrument not verified</Badge>}
          </div>
        </div>
      }
    >
      {current === 'instrument' && <InstrumentStep draft={draft} set={set} />}
      {current === 'person' && <PersonStep draft={draft} set={set} />}
      {current === 'search' && <SearchStep draft={draft} set={set} />}
      {current === 'property' && <PropertyStep draft={draft} set={set} />}
      {current === 'contacts' && <ContactsStep draft={draft} set={set} />}
      {current === 'health' && <HealthStep draft={draft} set={set} />}
      {current === 'placement' && <PlacementStep draft={draft} set={set} />}
      {current === 'decision' && <DecisionStep draft={draft} set={set} problems={problems} />}

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" disabled={index === 0} onClick={() => setCurrent(STEP_ORDER[index - 1])}>
          Back
        </Button>
        {last ? (
          <Button type="button" disabled={problems.length > 0 || receive.isPending} onClick={submit} variant={draft.decision === 'refuse' ? 'destructive' : 'default'}>
            {receive.isPending ? 'Recording…' : submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={() => setCurrent(STEP_ORDER[index + 1])}>
            Next
          </Button>
        )}
      </div>
    </ProcedureShell>
  )
}
