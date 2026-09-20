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
import { m } from '@/paraglide/messages'

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
  { value: 'admission', get label() { return m.ui_receive_someone() }, get description() { return m.ui_reception_under_a_warrant_or_order() }, icon: PrisonerIcon, requiresPrisoner: false },
  { value: 'visit', get label() { return m.ui_visit() }, get description() { return m.ui_authorize_or_record_a_visit() }, icon: HandshakeIcon, requiresPrisoner: true },
  { value: 'court_production', get label() { return m.ui_court_production() }, get description() { return m.ui_produce_a_prisoner_to_court_physical() }, icon: GavelIcon, requiresPrisoner: true },
  { value: 'transfer', get label() { return m.ui_transfer_out() }, get description() { return m.ui_prepare_dispatch_and_confirm_a_move() }, icon: ArrowDataTransferHorizontalIcon, requiresPrisoner: true },
  { value: 'health_event', get label() { return m.ui_health_welfare_event() }, get description() { return m.ui_referral_or_return_hospitalised_or_medic() }, icon: HealthIcon, requiresPrisoner: true },
  { value: 'release', get label() { return m.ui_discharge() }, get description() { return m.ui_release_on_entitlement_or_court_order() }, icon: DoorOpenIcon, requiresPrisoner: true },
  { value: 'property_record', get label() { return m.ui_property_effects() }, get description() { return m.ui_the_s_62_admission_time_record() }, icon: Archive01Icon, requiresPrisoner: true },
  { value: 'programme', get label() { return m.ui_programme_participation() }, get description() { return m.ui_link_a_prisoner_to_a_rehabilitation() }, icon: GraduationCapIcon, requiresPrisoner: true },
  { value: 'request', get label() { return m.ui_request_complaint() }, get description() { return m.ui_log_a_mukutano_complaint_linked_or() }, icon: Message01Icon, requiresPrisoner: false },
  { value: 'officer', get label() { return m.ui_officer() }, get description() { return m.ui_create_an_account_for_this_installation() }, icon: UserGroupIcon, requiresPrisoner: false },
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
export function AddRecordPanel({
  trigger,
  open: openProp,
  onOpenChange,
}: {
  trigger?: ReactElement
  /** Controlled use, for a launcher that lives elsewhere (the ribbon menu). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
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
    if (dirty && !window.confirm(m.ui_you_have_unsaved_changes_discard_them())) return
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
      {trigger &&
        cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
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
              aria-label={m.ui_add_record()}
              className={cn(
                "fixed top-0 right-0 z-50 h-dvh w-(--panel-width)",
                'flex flex-col bg-background shadow-2xl border-l border-border/35'
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <header className="panel-header gap-2">
                <section className="flex w-full items-center gap-2">
                  {screen.step !== 'grid' && (
                    <button
                      type="button"
                      aria-label={m.ui_back()}
                      className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
                      onClick={() => setScreen({ step: 'grid' })}
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-foreground">
                      {screen.step === 'grid' ? m.ui_add_record() : recordTypeInfo(screen.record).label}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {screen.step === 'prisoner'
                        ? m.ui_which_prisoner_is_this_for()
                        : screen.step === 'form' && screen.record !== 'request'
                          ? recordTypeInfo(screen.record).description
                          : m.ui_pick_what_you_re_adding_then()}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={m.ui_close()}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
                    onClick={requestClose}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} />
                  </button>
                </section>
              </header>

              <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                {screen.step === 'grid' && (
                  <div className="panel-body">
                    <div className="flex flex-col gap-2">
                      {recordTypes.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => {
                            if (startProcedure(r.value)) return
                            setScreen(r.requiresPrisoner ? { step: 'prisoner', record: r.value } : { step: 'form', record: r.value })
                          }}
                          className="flex w-full flex-col items-start gap-2 rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
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
                  <div className="flex min-h-0 flex-1 flex-col">
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
      <div className="flex min-h-0 flex-1 flex-col">
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
        <div className="panel-header justify-between gap-2 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">{prisoner.prisonerNumber ?? prisoner.id}</Badge>
            {prisonerFullName(prisoner)}
          </div>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={onPickPrisoner}>
            {m.ui_change()}
          </button>
        </div>
      )}
      <Suspense fallback={<PanelLoading />}>{body}</Suspense>
    </div>
  )
}

function PanelLoading() {
  return <div className="p-4 text-xs text-muted-foreground">{m.ui_loading()}</div>
}

/** Search within the panel itself, rather than requiring the officer to
 * back out and navigate to Search first — the whole point of Visit living
 * in this shared panel is not having to leave it to find the prisoner a
 * visit is for. The same picker serves every person-scoped record type. */
function PrisonerPicker({ onSelect }: { onSelect: (prisoner: Prisoner) => void }) {
  const [query, setQuery] = useState('')

  return (
    <div className="panel-body gap-3">
      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.ui_search_prisoners_by_name_or_national()}
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
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">{m.ui_start_typing_to_find_a_prisoner()}</p>
  }

  if (prisoners.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">{m.ui_no_prisoners_match({ query })}</p>
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