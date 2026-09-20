import { PhotoCapture } from '@/components/photo-capture'
import { stayEntryKinds, sentenceTermText, usePrisonerFile } from '@/features/custody'
import { useCourtProductionsForPrisoner } from '@/features/court-productions'
import { useHealthEventsForPrisoner } from '@/features/health-events'
import { UniformChip } from '@/features/numbering'
import { ObligationQueue } from '@/features/obligations'
import { usePrisonerPhotos, useSavePrisonerPhoto } from '@/features/prisoner-photos'
import { useReleasesForPrisoner } from '@/features/releases'
import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { custodyStatusLabel, nationalities, prisonerFullName, prisonerSexes, prisonerStatusLabel, type Prisoner } from '@/features/prisoners/schema'
import { useTransfersForPrisoner } from '@/features/transfers'
import { useVisitsForPrisoner } from '@/features/visits'
import { ApiError } from '@/lib/api'
import { Camera01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState, type ReactNode } from 'react'
import { buildTimeline } from './timeline'

type View = 'front' | 'left' | 'right'
const views: readonly { value: View; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'left', label: 'Left side' },
  { value: 'right', label: 'Right side' },
]

const dateOnly = (ms: number | null) => (ms == null ? 'Not computed' : format(ms, 'd MMM yyyy'))

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

/** One inline fact of the record's header, separated by a rule. */
function InlineFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 pr-4 sm:border-r sm:border-border/60 sm:last:border-r-0">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm font-medium break-words">{value ?? <span className="text-muted-foreground">·</span>}</dd>
    </div>
  )
}

/** The identity header of a prisoner file, read as one document: photo and
 * number up front, key facts as inline metadata, flags as a quiet strip. */
function IdentityHeader({ prisoner }: { prisoner: Prisoner }) {
  const { data: photos } = usePrisonerPhotos(prisoner.id)
  const [photoOpen, setPhotoOpen] = useState(false)
  const inCustody = prisoner.currentStatus === 'in_custody'
  const number = prisoner.prisonerNumber ?? prisoner.id

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <PrisonerAvatar prisonerId={prisoner.id} name={prisonerFullName(prisoner)} size={72} className="rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl leading-tight font-medium">{prisonerFullName(prisoner)}</h1>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(number)
                t.success('Number copied')
              }}
              className="font-mono text-sm text-muted-foreground hover:text-primary"
              title="Copy number"
            >
              {number}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="secondary">{prisonerStatusLabel(prisoner.status)}</Badge>
            <UniformChip status={prisoner.status} />
            <Badge variant={inCustody ? 'outline' : 'secondary'}>{custodyStatusLabel(prisoner.currentStatus)}</Badge>
          </div>
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <HugeiconsIcon icon={Camera01Icon} size={14} />
            {photos.length > 0 ? 'Photos on file' : 'Take a photo'}
          </button>
        </div>
      </div>

      <dl className="flex flex-wrap gap-y-3 text-sm">
        <InlineFact label="Age" value={ageOn(prisoner.dateOfBirth) != null ? `${ageOn(prisoner.dateOfBirth)} years` : null} />
        <InlineFact label="Sex" value={lookup(prisonerSexes, prisoner.sex)} />
        <InlineFact label="Nationality" value={lookup(nationalities, prisoner.nationality)} />
        <InlineFact label="National ID" value={prisoner.nationalId} />
        <InlineFact label="Reference" value={prisoner.reference} />
        <InlineFact label="Offence" value={prisoner.offence} />
      </dl>

      <FlagStrip prisonerId={prisoner.id} />
      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photos of {prisonerFullName(prisoner)}</DialogTitle>
            <DialogDescription>Take each view with a camera or upload a file. A new photo replaces the one on file for that view.</DialogDescription>
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

function FlagStrip({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner, clocks, obligations, instruments } = file
  const inCustody = prisoner.currentStatus === 'in_custody'
  const now = Date.now()
  const overdue = obligations.filter((o) => o.dueAt != null && o.dueAt < now).length
  const pendingInstruments = instruments.some((i) => i.status === 'pending' || i.status === 'rectification_pending')
  const pastBail = inCustody && clocks.mandatoryBailOn != null && clocks.mandatoryBailOn <= now
  const inWindow = inCustody && clocks.paroleWindowOpensOn != null && clocks.paroleWindowOpensOn <= now && (clocks.releaseDueOn ?? 0) > now

  const flags = [
    (pendingInstruments || prisoner.documentsPending) && { label: 'Documents pending', tone: 'destructive' as const },
    pastBail && { label: 'Past mandatory bail', tone: 'destructive' as const },
    overdue > 0 && { label: `${overdue} overdue`, tone: 'destructive' as const },
    inWindow && { label: 'Parole window open', tone: 'outline' as const },
    clocks.reviewable && inCustody && { label: 's.88 review applies', tone: 'outline' as const },
    prisoner.highCourtOnlyOffence && { label: 'High Court only', tone: 'secondary' as const },
    prisoner.currentStatus === 'in_transit' && { label: 'In transit', tone: 'outline' as const },
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
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>

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

/** The legal position, as inline rows — not a card. */
function LegalPosition({ prisonerId, onOpenTab }: { prisonerId: string; onOpenTab: (tab: string) => void }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { sentence, clocks, prisoner } = file
  const rows: [string, string][] = sentence
    ? [
        ['Sentence', sentenceTermText(sentence)],
        ['Runs from', format(sentence.startsOn, 'd MMM yyyy')],
        ...(!clocks.isLife ? ([['Term ends', dateOnly(clocks.sentenceEndsOn)]] as [string, string][]) : []),
        ...(!clocks.isLife ? ([['Release due', dateOnly(clocks.releaseDueOn)]] as [string, string][]) : []),
        ...(clocks.paroleWindowOpensOn != null ? ([['Parole window opens', dateOnly(clocks.paroleWindowOpensOn)]] as [string, string][]) : []),
        ['Instruments', `${file.instruments.length}`],
      ]
    : [['Sentence', prisoner.status === 'convicted' ? 'Not recorded' : 'Unconvicted — no sentence yet'], ['Instruments', `${file.instruments.length}`]]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Legal position</h3>
        <button type="button" onClick={() => onOpenTab('legal')} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Open legal
        </button>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
  /** The depth tabs (legal, care, property, history). */
  children: ReactNode
}) {
  const { data: file } = usePrisonerFile(prisonerId)
  const now = Date.now()
  const { prisoner, clocks, sentence, obligations, stays } = file
  const inCustody = prisoner.currentStatus === 'in_custody'
  const remand = prisoner.status === 'unconvicted'
  const openStay = stays.find((s) => s.exitedAt == null)

  return (
    <article className="page">
      <IdentityHeader prisoner={prisoner} />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
        <p className="text-sm text-muted-foreground">
          Admitted {format(prisoner.admittedAt, 'd MMM yyyy')}
          {inCustody ? ` · ${clocks.daysHeld} days held` : ''} · {prisoner.currentLocation ?? 'Not placed'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/prisoners" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
            Back to population
          </Link>
          {inCustody && (
            <>
              <Link to="/procedures/transfer/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                {file.openTransfer ? 'Continue transfer' : 'Transfer out'}
              </Link>
              <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm' })}>
                Discharge
              </Link>
            </>
          )}
          {actions}
        </div>
      </div>

      <div className="flex flex-col gap-6 py-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Next court</span>
            <span className={cn('text-sm font-medium', remand && inCustody && !file.nextCourtAt && 'text-destructive')}>
              {file.nextCourtAt ? format(file.nextCourtAt, 'd MMM yyyy p') : 'None scheduled'}
            </span>
            {remand && (
              <span className="text-xs text-muted-foreground">
                {prisoner.highCourtOnlyOffence ? '180 days, High Court offence (Art. 23(6))' : '60 days (Art. 23(6))'}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{remand ? 'Mandatory-bail threshold' : 'Entitlement date'}</span>
            <span className="text-sm font-medium">{dateOnly(remand ? clocks.mandatoryBailOn : clocks.releaseDueOn)}</span>
            {sentence == null && (
              <span className="text-xs text-muted-foreground">{remand ? 'Computed from the remand period once the threshold applies' : 'Record the sentence to compute it'}</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Where</span>
            <span className="text-sm font-medium">{prisoner.currentLocation ?? 'Not placed'}</span>
            {openStay && (
              <span className="text-xs text-muted-foreground">
                {stayEntryKinds[openStay.entryKind as keyof typeof stayEntryKinds] ?? openStay.entryKind} {format(openStay.enteredAt, 'd MMM yyyy')}
              </span>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <div className="section-head">
            <h2>Open for this person</h2>
            <span className="text-xs text-muted-foreground">{obligations.length} open</span>
          </div>
          <ObligationQueue obligations={obligations} now={now} flat emptyMessage="Nothing is open for this person." />
        </section>

        <LegalPosition prisonerId={prisonerId} onOpenTab={onOpenTab} />

        <section className="flex flex-col gap-3">
          <div className="section-head">
            <h2>Timeline</h2>
            <button type="button" onClick={() => onOpenTab('history')} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Open full history
            </button>
          </div>
          <Timeline prisonerId={prisonerId} />
        </section>
      </div>

      {children}
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
      <PhotoCapture value={draft} onChange={setDraft} label={label} hint={onFile ? 'On file' : 'None yet'} shape="portrait" />
      {draft && (
        <Button
          size="xs"
          disabled={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync(draft)
              setDraft(null)
              t.success(`${label} photo saved`)
            } catch (error) {
              t.error('Could not save the photo', { description: error instanceof ApiError ? error.message : 'Please try again.' })
            }
          }}
        >
          {save.isPending ? 'Saving…' : `Save ${label.toLowerCase()} photo`}
        </Button>
      )}
    </div>
  )
}