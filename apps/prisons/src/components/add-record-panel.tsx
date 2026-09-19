import { CourtProductionForm } from '@/features/court-productions'
import { HealthEventForm } from '@/features/health-events'
import { OfficerForm } from '@/features/officers'
import { prisonerFullName, usePrisoners, type Prisoner } from '@/features/prisoners'
import { ProgrammeParticipationForm } from '@/features/programme-participations'
import { PropertyRecordForm } from '@/features/property-records'
import { RequestForm } from '@/features/requests'
import { VisitForm } from '@/features/visits'
import {
  Archive01Icon,
  ArrowDataTransferHorizontalIcon,
  ArrowLeft01Icon,
  Cancel01Icon,
  DoorOpenIcon,
  GavelIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HealthIcon,
  Message01Icon,
  PrisonerIcon,
  Search01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { cloneElement, Suspense, useEffect, useState, type ReactElement } from 'react'

type RecordType =
  | 'admission'
  | 'visit'
  | 'court_production'
  | 'transfer'
  | 'health_event'
  | 'release'
  | 'property_record'
  | 'programme'
  | 'request'
  | 'officer'

type RecordTypeInfo = {
  value: RecordType
  label: string
  description: string
  icon: any
  requiresPrisoner: boolean
}

/** The evidence-mapped set of addable records (docs/prisons/navigation.md
 * §4.6): exactly the built forms, nothing UNKNOWN gets a card. Person-
 * scoped records (Visit, Court Production, Transfer, Health, Release,
 * Property, Programme) need which prisoner first; Admission, Officer, and
 * Request go straight to their form (a complaint may stay anonymous). */
const recordTypes: readonly RecordTypeInfo[] = [
  { value: 'admission', label: 'Receive someone', description: 'Reception under a warrant or order: verify, search, inventory, place.', icon: PrisonerIcon, requiresPrisoner: false },
  { value: 'visit', label: 'Visit', description: 'Authorize or record a visit.', icon: HandshakeIcon, requiresPrisoner: true },
  { value: 'court_production', label: 'Court production', description: 'Produce a prisoner to court (physical or virtual).', icon: GavelIcon, requiresPrisoner: true },
  { value: 'transfer', label: 'Transfer out', description: 'Prepare, dispatch and confirm a move to another prison.', icon: ArrowDataTransferHorizontalIcon, requiresPrisoner: true },
  { value: 'health_event', label: 'Health & welfare event', description: 'Referral or return, hospitalised or medical.', icon: HealthIcon, requiresPrisoner: true },
  { value: 'release', label: 'Discharge', description: 'Release on entitlement or court order, with the gates checked.', icon: DoorOpenIcon, requiresPrisoner: true },
  { value: 'property_record', label: 'Property & effects', description: 'The s.62 admission-time record of effects.', icon: Archive01Icon, requiresPrisoner: true },
  { value: 'programme', label: 'Programme participation', description: 'Link a prisoner to a rehabilitation or work programme.', icon: GraduationCapIcon, requiresPrisoner: true },
  { value: 'request', label: 'Request / complaint', description: 'Log a Mukutano complaint, linked or anonymous.', icon: Message01Icon, requiresPrisoner: false },
  { value: 'officer', label: 'Officer', description: 'Create an account for this installation.', icon: UserGroupIcon, requiresPrisoner: false },
]

function recordTypeInfo(value: RecordType): RecordTypeInfo {
  return recordTypes.find((r) => r.value === value)!
}

type Screen =
  | { step: 'grid' }
  | { step: 'prisoner'; record: RecordType }
  | { step: 'form'; record: RecordType; prisoner?: Prisoner }

/**
 * The single entry point for creating any kind of record (docs/prisons/
 * navigation.md §4.6): a framer-motion panel — same animation language as
 * the onboarding gates, not the Drawer component — showing a grid of
 * record types. Selecting a card is real "steps": person-scoped records
 * ask which prisoner via a search (so a visit is never recorded against
 * the wrong person), then show that record's inputs. Facility only: Head
 * Office has no prisoners or visits of its own and already manages its
 * own officers on `/officers`, so the whole panel is hidden there in
 * `Headers`.
 */
export function AddRecordPanel({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [screen, setScreen] = useState<Screen>({ step: 'grid' })
  const navigate = useNavigate()

  /** Reception, discharge and transfer are guided procedures with their own
   * pages, not drawer forms: the launcher hands off to them. */
  const startProcedure = (record: RecordType, prisoner?: Prisoner): boolean => {
    if (record === 'admission') {
      void navigate({ to: '/procedures/reception' })
    } else if (record === 'release' && prisoner) {
      void navigate({ to: '/procedures/discharge/$prisonerId', params: { prisonerId: prisoner.id } })
    } else if (record === 'transfer' && prisoner) {
      void navigate({ to: '/procedures/transfer/$prisonerId', params: { prisonerId: prisoner.id } })
    } else {
      return false
    }
    setOpen(false)
    reset()
    return true
  }

  const reset = () => {
    setDirty(false)
    setScreen({ step: 'grid' })
  }

  const requestClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return
    setOpen(false)
    reset()
  }

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, dirty])

  return (
    <>
      {cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen(true),
      })}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="add-record-backdrop"
              className="fixed inset-0 z-50 bg-background/15 backdrop-blur"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={requestClose}
            />
            <motion.aside
              key="add-record-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Add record"
              className={cn(
                "fixed top-0 right-0 z-50 h-dvh w-full md:max-w-[80wvh]!",
                'flex flex-col bg-background shadow-2xl border-l border-border/35'
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <header className="flex items-center shrink-0 border-b w-full border-border/60">
                <section className="flex w-full items-center gap-2 px-5 py-3">
                  {screen.step !== 'grid' && (
                    <button
                      type="button"
                      aria-label="Back"
                      className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
                      onClick={() => setScreen({ step: 'grid' })}
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-foreground">
                      {screen.step === 'grid' ? 'Add record' : recordTypeInfo(screen.record).label}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {screen.step === 'prisoner'
                        ? 'Which prisoner is this for?'
                        : screen.step === 'form' && screen.record !== 'request'
                          ? recordTypeInfo(screen.record).description
                          : 'Pick what you\u2019re adding, then fill it in.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
                    onClick={requestClose}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} />
                  </button>
                </section>
              </header>

              <div className="px-5 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                {screen.step === 'grid' && (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="flex flex-wrap gap-2">
                      {recordTypes.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => {
                            if (startProcedure(r.value)) return
                            setScreen(r.requiresPrisoner ? { step: 'prisoner', record: r.value } : { step: 'form', record: r.value })
                          }}
                          className="flex min-w-52 flex-1 basis-56 flex-col items-start gap-2 rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <HugeiconsIcon icon={r.icon} size={16} />
                          </span>
                          <span className="text-sm font-medium">{r.label}</span>
                          <span className="text-xs text-muted-foreground">{r.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {screen.step === 'prisoner' && (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <PrisonerPicker
                      onSelect={(prisoner) => {
                        if (startProcedure(screen.record, prisoner)) return
                        setScreen({ step: 'form', record: screen.record, prisoner })
                      }}
                    />
                  </div>
                )}

                {screen.step === 'form' && (
                  <RecordFormStep
                    record={screen.record}
                    prisoner={screen.prisoner}
                    onPickPrisoner={() => setScreen({ step: 'prisoner', record: screen.record })}
                    onSuccess={() => {
                      setOpen(false)
                      reset()
                    }}
                    onDirtyChange={setDirty}
                  />
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

const prisonerScopedRecords = ['visit', 'court_production', 'transfer', 'health_event', 'release', 'property_record', 'programme'] as const

function isPrisonerScoped(record: RecordType): record is (typeof prisonerScopedRecords)[number] {
  return (prisonerScopedRecords as readonly string[]).includes(record)
}

function RecordFormStep({
  record,
  prisoner,
  onPickPrisoner,
  onSuccess,
  onDirtyChange,
}: {
  record: RecordType
  prisoner?: Prisoner
  onPickPrisoner: () => void
  onSuccess: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  if (isPrisonerScoped(record) && !prisoner) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PrisonerPicker onSelect={onPickPrisoner} />
      </div>
    )
  }

  const common = { onSuccess, onDirtyChange }
  const withPrisoner = isPrisonerScoped(record) && prisoner ? { prisonerId: prisoner.id, ...common } : null

  const body = (() => {
    switch (record) {
      case 'admission':
      case 'transfer':
      case 'release':
        return null
      case 'visit':
        return <VisitForm {...withPrisoner!} />
      case 'court_production':
        return <CourtProductionForm {...withPrisoner!} />
      case 'health_event':
        return <HealthEventForm {...withPrisoner!} />
      case 'property_record':
        return <PropertyRecordForm {...withPrisoner!} />
      case 'programme':
        return <ProgrammeParticipationForm {...withPrisoner!} />
      case 'request':
        return <RequestForm {...common} />
      case 'officer':
        return <OfficerForm onSuccess={onSuccess} />
    }
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {prisoner && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">{prisoner.prisonerNumber ?? prisoner.id}</Badge>
            {prisonerFullName(prisoner)}
          </div>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={onPickPrisoner}>
            Change
          </button>
        </div>
      )}
      <Suspense fallback={<PanelLoading />}>{body}</Suspense>
    </div>
  )
}

function PanelLoading() {
  return <div className="p-4 text-xs text-muted-foreground">Loading…</div>
}

/** Search within the panel itself, rather than requiring the officer to
 * back out and navigate to Search first — the whole point of Visit living
 * in this shared panel is not having to leave it to find the prisoner a
 * visit is for. The same picker serves every person-scoped record type. */
function PrisonerPicker({ onSelect }: { onSelect: (prisoner: Prisoner) => void }) {
  const [query, setQuery] = useState('')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prisoners by name or national ID…"
          className="pl-8"
        />
      </div>

      <Suspense fallback={<PanelLoading />}>
        <PrisonerPickerResults query={query} onSelect={onSelect} />
      </Suspense>
    </div>
  )
}

function PrisonerPickerResults({ query, onSelect }: { query: string; onSelect: (prisoner: Prisoner) => void }) {
  const { data: prisoners } = usePrisoners(query)

  if (!query.trim()) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">Start typing to find a prisoner.</p>
  }

  if (prisoners.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">No prisoners match "{query}".</p>
  }

  return (
    <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
      {prisoners.slice(0, 20).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p)}
          className={cn('flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60')}
        >
          <span className="truncate">{prisonerFullName(p)}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {p.prisonerNumber ?? p.id}
          </Badge>
        </button>
      ))}
    </div>
  )
}