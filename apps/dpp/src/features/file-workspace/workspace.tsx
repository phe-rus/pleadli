import { Tag } from '@/components/status-tag'
import { FileStatusTag } from '@/components/status-tag'
import { PanelButton } from '@/components/add-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useChargesForFile } from '@/features/charges'
import { useReviewsForFile } from '@/features/charging-review'
import { useDecisionsForFile } from '@/features/decisions'
import { useDirectionsForFile } from '@/features/directions'
import { useEvidenceForFile } from '@/features/evidence'
import {
  EditProsecutionFileForm,
  fileReference,
  LinkPersonForm,
  personFullNameForRole,
  useFilePeople,
  useProsecutionFile,
  useUnlinkPersonFromFile,
} from '@/features/prosecution-files'
import { ResubmissionForm } from '@/features/referrals'
import { useReviewNotesForFile } from '@/features/review-notes'
import { useStatementsForFile } from '@/features/statements'
import { useConnectionsQuiet } from '@/features/interchange'
import { workloadOptions } from '@/features/workload'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { ChronologyPanel, CourtPanel, DecisionsPanel, DocumentsPanel } from './decision-panels'
import { MaterialPanel, ReviewPanel } from './material-panel'
import { nextAction, thresholdDueFor, type FileFacts } from './next-action'

export const fileTabs = [
  { id: 'file', label: 'File' },
  { id: 'chronology', label: 'Chronology' },
  { id: 'material', label: 'Police material' },
  { id: 'review', label: 'Review' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'court', label: 'Court' },
  { id: 'documents', label: 'Documents' },
] as const

export type FileTabId = (typeof fileTabs)[number]['id']

export function isFileTab(value: unknown): value is FileTabId {
  return fileTabs.some((tab) => tab.id === value)
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate', !value && 'text-muted-foreground')}>{value || 'Not recorded'}</dd>
    </div>
  )
}

/** The file workspace: who and what the file is, where it stands and what to
 * do next, and then the file's own material one focused tab at a time. The
 * header never scrolls away with the tabs' contents, so the state and the next
 * step are always in view. */
export function FileWorkspace({ fileId, tab }: { fileId: string; tab: FileTabId }) {
  const { data: file } = useProsecutionFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidence } = useEvidenceForFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: notes } = useReviewNotesForFile(fileId)
  const { data: reviews } = useReviewsForFile(fileId)
  const { data: directions } = useDirectionsForFile(fileId)
  const { data: workload } = useQuery(workloadOptions())
  const { data: connections } = useConnectionsQuiet()

  if (!file) {
    return (
      <article className="page page-narrow">
        <header className="page-header">
          <div>
            <h1>File not found</h1>
            <p>This file is not in the register. It may have been opened on another installation.</p>
          </div>
        </header>
        <Link to="/files" search={{ view: 'all' }} className="w-fit">Back to all files</Link>
      </article>
    )
  }

  const openReview = reviews.find((r) => r.concludedAt === null)
  const lastReturn = decisions.find((d) => d.decisionType === 'return_for_investigation')
  const facts: FileFacts = {
    file,
    statements: statements.length,
    evidence: evidence.length,
    charges: charges.length,
    reviewNotes: notes.length,
    decisions: decisions.length,
    returnedAt: lastReturn?.decidedAt ?? null,
    directionsTotal: directions.length,
    directionsOpen: directions.filter((d) => d.response === 'open').length,
    openReview: openReview ? { standard: openReview.standard, reopens: openReview.reopensDecisionId !== null, reason: openReview.reopenReason } : null,
    thresholdDueAt: thresholdDueFor(workload, fileId),
  }
  const action = nextAction(facts)
  const counts: Partial<Record<FileTabId, number>> = {
    material: statements.length + evidence.length + charges.length,
    review: notes.length + reviews.length,
    decisions: decisions.length,
  }
  const daysToThreshold = facts.thresholdDueAt ? differenceInCalendarDays(facts.thresholdDueAt, new Date()) : null

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{file.title}</h1>
            <FileStatusTag status={file.currentStatus} />
          </div>
          <p>
            {fileReference(file)}
            {file.policeStation ? `, ${file.policeStation}` : ''}. Received {format(file.receivedAt, 'PP')}.
            {file.policeConnectionId && connections?.find((c) => c.id === file.policeConnectionId) ? ` Referred through the connection to ${connections.find((c) => c.id === file.policeConnectionId)?.stationName}.` : ''}
          </p>
        </div>
        <div className="page-actions">
          <PanelButton label="Edit details" title="Edit file details" description="Update registration, reference and court numbers." icon={false}>
            {({ close, setDirty }) => <EditProsecutionFileForm file={file} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <section aria-label="Where this file stands" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3>{action.state}</h3>
            <p>{action.next}</p>
          </div>
          <div className="page-actions">
            {action.action === 'resubmission' && (
              <PanelButton label="Log resubmission" title="Log resubmission" description="Record the file coming back from Police." variant="default">
                {({ close, setDirty }) => <ResubmissionForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
              </PanelButton>
            )}
            {!action.action && action.tab !== tab && (
              <Link to="/files/$fileId" params={{ fileId }} search={{ tab: action.tab }} className="text-primary">
                {action.label}
              </Link>
            )}
          </div>
        </div>
        {daysToThreshold !== null && (
          <p className="flex flex-wrap items-center gap-2">
            <Tag tone={daysToThreshold < 0 ? 'urgent' : 'open'}>Threshold review</Tag>
            {daysToThreshold < 0
              ? `The 14-day review of the Threshold Test charge was due ${format(facts.thresholdDueAt!, 'PP')}. It clears when a later decision is recorded.`
              : `The 14-day review of the Threshold Test charge is due ${format(facts.thresholdDueAt!, 'PP')}.`}
          </p>
        )}
      </section>

      <nav aria-label="File sections" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {fileTabs.map((item) => {
          const active = item.id === tab
          return (
            <Link
              key={item.id}
              to="/files/$fileId"
              params={{ fileId }}
              search={{ tab: item.id }}
              replace
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-1.5 no-underline transition-colors motion-reduce:transition-none',
                active ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {counts[item.id] ? <span className="rounded-full bg-secondary px-1.5 text-[0.625rem] leading-4 tabular-nums">{counts[item.id]}</span> : null}
            </Link>
          )
        })}
      </nav>

      {tab === 'file' && <FilePanel fileId={fileId} />}
      {tab === 'chronology' && <ChronologyPanel fileId={fileId} />}
      {tab === 'material' && <MaterialPanel fileId={fileId} />}
      {tab === 'review' && <ReviewPanel fileId={fileId} />}
      {tab === 'decisions' && <DecisionsPanel fileId={fileId} />}
      {tab === 'court' && <CourtPanel fileId={fileId} />}
      {tab === 'documents' && <DocumentsPanel fileId={fileId} />}
    </article>
  )
}

/** The file itself: its references, the people on it, its notes and its own
 * attachments. */
function FilePanel({ fileId }: { fileId: string }) {
  const { data: file } = useProsecutionFile(fileId)
  const { data: people } = useFilePeople(fileId)
  const unlink = useUnlinkPersonFromFile()
  if (!file) return null

  return (
    <div className="flex flex-col gap-6">
      <section className="page-section">
        <h2>References</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="ODPP registration no." value={file.odppRegistrationNumber} />
          <Fact label="Police reference" value={file.policeReference} />
          <Fact label="Police station" value={file.policeStation} />
          <Fact label="Court case no." value={file.courtCaseNumber} />
        </dl>
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>People</h2>
          <PanelButton label="Link a person" title="Link a person" description="Add an accused, complainant or witness to this file.">
            {({ close }) => <LinkPersonForm prosecutionFileId={fileId} onSuccess={close} />}
          </PanelButton>
        </div>
        {people.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">No one is linked to this file yet.</p>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {people.map((link) => (
              <div key={link.id} role="listitem" className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Tag tone="neutral" className="capitalize">{link.role}</Tag>
                  <span className="truncate">{personFullNameForRole(link)}</span>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => unlink.mutate(link.id)} aria-label={`Remove ${personFullNameForRole(link)} from this file`}>
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {file.notes && (
        <section className="page-section">
          <h2>Notes</h2>
          <RichTextPreview value={file.notes} />
        </section>
      )}

      <section className="page-section">
        <h2>Attachments</h2>
        <AttachmentsField entityType={entityTypes.prosecutionFile} entityId={file.id} />
      </section>
    </div>
  )
}

