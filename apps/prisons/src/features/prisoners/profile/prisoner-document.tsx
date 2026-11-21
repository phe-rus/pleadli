import { JurisdictionContext } from '@/features/jurisdiction/jurisdiction-context'
import { PhotoCapture } from '@/components/photo-capture'
import { stayEntryKinds, sentenceTermText, usePrisonerFile } from '@/features/custody'
import { CourtProductionForm, useCourtProductionsForPrisoner } from '@/features/court-productions'
import { Createpanel } from '@/components/create-panel'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { useHealthEventsForPrisoner } from '@/features/health-events'
import { UniformChip } from '@/features/numbering'
import { ObligationQueue } from '@/features/obligations'
import { usePrisonerPhotos, useSavePrisonerPhoto } from '@/features/prisoner-photos'
import { useReleasesForPrisoner } from '@/features/releases'
import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { custodyStatusLabel, mandatoryBailThresholdDays, nationalities, prisonerFullName, prisonerSexes, prisonerStatusLabel, type Prisoner } from '@/features/prisoners/schema'
import { useTransfersForPrisoner } from '@/features/transfers'
import { useVisitsForPrisoner } from '@/features/visits'
import { ApiError } from '@/lib/api'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useState, type ReactNode } from 'react'
import { buildTimeline } from './timeline'
import { PrisonerRecordPaper } from './prisoner-paper'
import { PaperWindow } from '@/features/paper/record-paper'
import { m } from '@/paraglide/messages'

type View = 'front' | 'left' | 'right'
const views: readonly { value: View; label: string }[] = [
  { value: 'front', get label() { return m.prisoners_front() } },
  { value: 'left', get label() { return m.prisoners_left_side() } },
  { value: 'right', get label() { return m.prisoners_right_side() } },
]

const DAY_MS = 86_400_000
const dateOnly = (ms: number | null) => (ms == null ? m.prisoners_not_computed() : format(ms, 'd MMM yyyy'))

function ageOn(dateOfBirth: number | null) {
  if (dateOfBirth == null) return null
  const born = new Date(dateOfBirth)
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1
  return years
}

function lookup(list: readonly { value: string; label: string }[], value: string | null) {
  return value ? (list.find((item) => item.value === value)?.label ?? value) : null
}

/** Where this person stands, in one sentence, the way an officer would say
 * it at the gate: on remand since when, which day of which limit, next in
 * court; or serving what, out when. Red only for what the law has passed. */
function StatusLine({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner, clocks, sentence } = file
  const now = Date.now()
  const since = format(prisoner.admittedAt, 'd MMM yyyy')
  if (prisoner.currentStatus !== 'in_custody') return <p className="text-muted-foreground">{custodyStatusLabel(prisoner.currentStatus)}</p>

  const parts: { text: string; urgent?: boolean }[] = []
  if (prisoner.status === 'unconvicted') {
    const limit = mandatoryBailThresholdDays(prisoner.highCourtOnlyOffence)
    const past = clocks.mandatoryBailOn != null && clocks.mandatoryBailOn <= now
    parts.push(past ? { text: m.file_status_remand_past({ since, day: clocks.daysHeld, limit }), urgent: true } : { text: m.file_status_remand({ since, day: clocks.daysHeld, limit }) })
    parts.push(file.nextCourtAt ? { text: m.file_status_next_court({ when: format(file.nextCourtAt, 'EEE d MMM, p') }) } : { text: m.file_status_no_court(), urgent: true })
  } else if (prisoner.status === 'convicted') {
    if (clocks.isLife) parts.push({ text: m.file_status_serving_life() })
    else if (sentence && clocks.releaseDueOn != null) parts.push({ text: m.file_status_serving({ term: sentenceTermText(sentence), date: format(clocks.releaseDueOn, 'd MMM yyyy') }), urgent: clocks.releaseDueOn <= now })
    else parts.push({ text: m.file_status_convicted_no_sentence(), urgent: true })
  } else {
    parts.push({ text: m.file_status_civil({ since }) })
  }
  return (
    <p className="text-[0.9375rem]">
      {parts.map((part, i) => (
        <span key={i} className={cn(part.urgent ? 'font-medium text-destructive' : 'text-foreground')}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {part.text}
        </span>
      ))}
    </p>
  )
}

/** The head of a prisoner's file: face, name and number, where they stand,
 * and the one thing to do now. Particulars wait in a quiet group below. */
function IdentityHeader({ prisoner, primary, more }: { prisoner: Prisoner; primary: ReactNode; more: ReactNode }) {
  const [photoOpen, setPhotoOpen] = useState(false)

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <button type="button" onClick={() => setPhotoOpen(true)} title={m.file_photos()} className="shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <PrisonerAvatar prisonerId={prisoner.id} name={prisonerFullName(prisoner)} size={80} className="rounded-full" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1>{prisonerFullName(prisoner)}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
            {prisoner.prisonerNumber ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(prisoner.prisonerNumber ?? '')
                  t.success(m.prisoners_number_copied())
                }}
                className="cursor-pointer tabular-nums hover:text-foreground"
                title={m.prisoners_copy_number()}
              >
                {prisoner.prisonerNumber}
              </button>
            ) : (
              <span>{m.file_no_number()}</span>
            )}
            <span aria-hidden>·</span>
            <span>{prisonerStatusLabel(prisoner.status)}</span>
            <UniformChip status={prisoner.status} />
          </p>
          <StatusLine prisonerId={prisoner.id} />
          <JurisdictionContext />
          <FlagStrip prisonerId={prisoner.id} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {primary}
          {more}
        </div>
      </div>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{m.prisoners_photos_of({ prisoner: prisonerFullName(prisoner) })}</DialogTitle>
            <DialogDescription>{m.prisoners_take_each_view_with_a_camera()}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-4">
            {views.map((view) => (
              <PhotoSlot key={view.value} prisoner={prisoner} view={view.value} label={view.label} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}

/** The person's particulars and legal position as two calm groups. */
function FileFacts({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner, clocks, stays } = file
  const remand = prisoner.status === 'unconvicted'
  const openStay = stays.find((s) => s.exitedAt == null)
  const age = ageOn(prisoner.dateOfBirth)
  const dash = <span className="text-muted-foreground">·</span>
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Group title={m.file_legal()}>
        {remand && <GroupRow label={m.file_next_court()} value={file.nextCourtAt ? format(file.nextCourtAt, 'd MMM yyyy, p') : <span className="text-destructive">{m.prisoners_none_scheduled()}</span>} />}
        {remand && <GroupRow label={m.file_bail_limit()} detail={prisoner.highCourtOnlyOffence ? m.prisoners_180_days_high_court_offence_art() : m.prisoners_60_days_art_23_6()} value={dateOnly(clocks.mandatoryBailOn)} />}
        {!remand && file.sentence && <GroupRow label={m.prisoners_sentence()} detail={m.prisoners_runs_from() + ' ' + format(file.sentence.startsOn, 'd MMM yyyy')} value={sentenceTermText(file.sentence)} />}
        {!remand && <GroupRow label={m.file_release_due()} value={clocks.isLife ? m.file_status_serving_life() : dateOnly(clocks.releaseDueOn)} />}
        <GroupRow label={m.prisoners_offence()} value={prisoner.offence ?? dash} />
        <GroupRow
          label={m.file_where()}
          detail={openStay ? `${stayEntryKinds[openStay.entryKind as keyof typeof stayEntryKinds] ?? openStay.entryKind} ${format(openStay.enteredAt, 'd MMM yyyy')}` : undefined}
          value={prisoner.currentLocation ?? m.prisoners_not_placed()}
        />
      </Group>
      <Group title={m.file_about()}>
        <GroupRow label={m.prisoners_age()} value={age != null ? `${age}` : dash} />
        <GroupRow label={m.prisoners_sex()} value={lookup(prisonerSexes, prisoner.sex) ?? dash} />
        <GroupRow label={m.prisoners_nationality()} value={lookup(nationalities, prisoner.nationality) ?? dash} />
        <GroupRow label={m.prisoners_national_id()} value={prisoner.nationalId ?? dash} />
        <GroupRow label={m.prisoners_reference()} value={prisoner.reference ?? dash} />
      </Group>
    </div>
  )
}

function FlagStrip({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner, clocks, obligations, instruments } = file
  const inCustody = prisoner.currentStatus === 'in_custody'
  const now = Date.now()
  const overdue = obligations.filter((o) => o.dueAt != null && o.dueAt < now).length
  const pendingInstruments = instruments.some((i) => i.status === 'pending' || i.status === 'rectification_pending')
  const inWindow = inCustody && clocks.paroleWindowOpensOn != null && clocks.paroleWindowOpensOn <= now && (clocks.releaseDueOn ?? 0) > now

  const flags = [
    (pendingInstruments || prisoner.documentsPending) && { label: m.prisoners_documents_pending(), tone: 'destructive' as const },
    overdue > 0 && { label: m.prisoners_overdue({ overdue }), tone: 'destructive' as const },
    inWindow && { label: m.prisoners_parole_window_open(), tone: 'outline' as const },
    clocks.reviewable && inCustody && { label: m.prisoners_s_88_review_applies(), tone: 'outline' as const },
    prisoner.currentStatus === 'in_transit' && { label: m.prisoners_in_transit(), tone: 'outline' as const },
  ].filter(Boolean) as { label: string; tone: 'destructive' | 'outline' | 'secondary' }[]

  if (flags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <Badge key={flag.label} variant={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  )
}

/** The timeline of the file: every domain on one line, newest first. */
function Timeline({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { data: productions } = useCourtProductionsForPrisoner(prisonerId)
  const { data: visits } = useVisitsForPrisoner(prisonerId)
  const { data: healthEvents } = useHealthEventsForPrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const { data: releases } = useReleasesForPrisoner(prisonerId)

  const entries = buildTimeline({ stays: file.stays, productions, visits, healthEvents, transfers, releases })
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{m.prisoners_nothing_recorded_yet()}</p>

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex items-baseline gap-3 pb-1.5 text-sm">
          <span className={cn('w-16 shrink-0 pt-px text-[10px] tracking-wide text-muted-foreground uppercase', index === 0 && 'text-primary')}>
            {format(entry.at, 'd MMM yyyy')}
          </span>
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', index === 0 ? 'bg-primary' : 'bg-muted-foreground/50')} />
          <span className="min-w-0">
            <span className="font-medium">{entry.title}</span>
            {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The prisoner file re-read as a document (docs/prisons/product-map/08 1.4):
 * who this person is, where they are in the legal machine, what is owed for
 * them, and the connected records — with the depth as quieter tabs below.
 */
export function PrisonerDocument({
  prisonerId,
  onOpenTab,
  actions,
  children,
}: {
  prisonerId: string
  onOpenTab: (tab: string) => void
  /** Header actions such as editing the person's details. */
  actions?: ReactNode
  /** The file owns its navigation; the summary becomes its Overview panel. */
  children: (overview: ReactNode) => ReactNode
}) {
  const { data: file } = usePrisonerFile(prisonerId)
  const now = Date.now()
  const { prisoner, clocks, obligations } = file
  const inCustody = prisoner.currentStatus === 'in_custody'
  const remand = prisoner.status === 'unconvicted'
  const [courtOpen, setCourtOpen] = useState(false)
  const [paperOpen, setPaperOpen] = useState(false)
  const [courtDirty, setCourtDirty] = useState(false)

  const releaseDue = !remand && clocks.releaseDueOn != null && clocks.releaseDueOn <= now + DAY_MS
  // The one thing to do now, in blue; the rest waits behind "···".
  const primary = !inCustody ? null : remand && !file.nextCourtAt ? (
    <Button size="sm" onClick={() => setCourtOpen(true)}>
      {m.file_add_court_date()}
    </Button>
  ) : releaseDue ? (
    <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm' })}>
      {m.prisoners_discharge()}
    </Link>
  ) : null
  const more = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label={m.file_more()} title={m.file_more()} className="cursor-pointer">
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {inCustody && (
          <>
            <DropdownMenuItem onClick={() => setCourtOpen(true)}>{m.file_add_court_date()}</DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/procedures/transfer/$prisonerId" params={{ prisonerId }} />}>
              {file.openTransfer ? m.prisoners_continue_transfer() : m.prisoners_transfer_out()}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/procedures/discharge/$prisonerId" params={{ prisonerId }} />}>{m.prisoners_discharge()}</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => setPaperOpen(true)}>{m.paper_open_record()}</DropdownMenuItem>
        {actions}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const overview = (
    <div className="flex flex-col gap-6 py-2">
      <FileFacts prisonerId={prisonerId} />

      {obligations.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="section-head">
            <h2>{m.prisoners_open_for_this_person()}</h2>
            <span className="text-xs text-muted-foreground">{m.prisoners_open({ length: obligations.length })}</span>
          </div>
          <ObligationQueue obligations={obligations} now={now} flat emptyMessage={m.prisoners_nothing_is_open_for_this_person()} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="section-head">
          <h2>{m.prisoners_timeline()}</h2>
          <button type="button" onClick={() => onOpenTab('history')} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            {m.prisoners_open_full_history()}
          </button>
        </div>
        <Timeline prisonerId={prisonerId} />
      </section>
    </div>
  )

  return (
    <article className="page">
      <IdentityHeader prisoner={prisoner} primary={primary} more={more} />

      {children(overview)}

      <PaperWindow open={paperOpen} onOpenChange={setPaperOpen} title={m.paper_prisoner_record()}>
        {paperOpen && <PrisonerRecordPaper prisonerId={prisonerId} />}
      </PaperWindow>

      <Createpanel open={courtOpen} onOpenChange={setCourtOpen} isDirty={courtDirty} headings={{ title: m.file_add_court_date(), description: m.prisoners_180_days_high_court_offence_art() }}>
        <CourtProductionForm prisonerId={prisonerId} onSuccess={() => setCourtOpen(false)} onDirtyChange={setCourtDirty} />
      </Createpanel>
    </article>
  )
}

function PhotoSlot({ prisoner, view, label }: { prisoner: Prisoner; view: View; label: string }) {
  const save = useSavePrisonerPhoto(prisoner.id, view)
  const { data: photos } = usePrisonerPhotos(prisoner.id)
  const [draft, setDraft] = useState<string | null>(null)
  const onFile = photos.some((p) => p.view === view)

  return (
    <div className="flex min-w-40 flex-1 basis-44 flex-col gap-2">
      <PhotoCapture value={draft} onChange={setDraft} label={label} hint={onFile ? m.prisoners_on_file() : m.prisoners_none_yet()} shape="portrait" />
      {draft && (
        <Button
          size="xs"
          disabled={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync(draft)
              setDraft(null)
              t.success(m.prisoners_photo_saved({ label }))
            } catch (error) {
              t.error(m.prisoners_could_not_save_the_photo(), { description: error instanceof ApiError ? error.message : m.prisoners_please_try_again() })
            }
          }}
        >
          {save.isPending ? m.prisoners_saving() : m.prisoners_save_photo({ label: label.toLowerCase() })}
        </Button>
      )}
    </div>
  )
}