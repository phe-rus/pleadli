import { formatDate } from '@/lib/dates'
import { referenceLabel } from '@/lib/jurisdiction'
import { Tag } from '@/components/status-tag'
import { FileStatusTag } from '@/components/status-tag'
import { PanelButton } from '@/components/add-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useChargesForFile } from '@/features/charges'
import {
  EditProsecutionFileForm,
  LinkPersonForm,
  personFullNameForRole,
  useFilePeople,
  useProsecutionFile,
  useUnlinkPersonFromFile,
} from '@/features/prosecution-files'
import { useConnectionsQuiet } from '@/features/interchange'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { ChronologyPanel } from './decision-panels'
import { hearingKindLabel, useHearings } from '@/features/court'
import { FileTasks } from '@/features/board'
import { useFileItems } from '@/features/file-index'
import { CaseTab } from '@/features/pipeline'
import { FileBinder } from '@/features/paper/file-binder'
import { filePersonRoles } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'

/** Three tabs: the case (its stage and what to accept next), the file itself
 * (every document), and what happened. Older links still land: each old tab
 * name maps to the tab that now holds it. */
export const fileTabs = [
  { id: 'case', get label() { return m["file_tab.case"]() } },
  { id: 'papers', get label() { return m["file_tab.index"]() } },
  { id: 'activity', get label() { return m["file_tab.activity"]() } },
] as const

const legacyTabs = {
  index: 'papers',
  file: 'papers',
  material: 'papers',
  chronology: 'activity',
  documents: 'activity',
  review: 'case',
  decisions: 'case',
  court: 'case',
} as const

export type FileTabId = (typeof fileTabs)[number]['id'] | keyof typeof legacyTabs

export function isFileTab(value: unknown): value is FileTabId {
  return fileTabs.some((tab) => tab.id === value) || (typeof value === 'string' && value in legacyTabs)
}

const canonicalTab = (tab: FileTabId): (typeof fileTabs)[number]['id'] => (tab in legacyTabs ? legacyTabs[tab as keyof typeof legacyTabs] : (tab as 'case'))

/** A section folded away until wanted: details the prosecutor rarely needs. */
function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl ring-1 ring-border/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('ms-0 truncate', !value && 'text-muted-foreground')}>{value || m["common.not_recorded"]()}</dd>
    </div>
  )
}

/** The file workspace: who and what the file is, where it stands and what to
 * do next, and then the file's own material one focused tab at a time. The
 * header never scrolls away with the tabs' contents, so the state and the next
 * step are always in view. */
export function FileWorkspace({ fileId, tab }: { fileId: string; tab: FileTabId }) {
  const { data: file } = useProsecutionFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: connections } = useConnectionsQuiet()
  const { data: people } = useFilePeople(fileId)
  const { data: hearings = [] } = useHearings(fileId)
  const { data: papers = [] } = useFileItems(fileId)

  if (!file) {
    return (
      <article className="page page-narrow">
        <header className="page-header">
          <div>
            <h1>{m["file_ws.not_found"]()}</h1>
            <p>{m["file_ws.not_found_body"]()}</p>
          </div>
        </header>
        <Link to="/files" search={{ view: 'all' }} className="w-fit">{m["file_ws.back"]()}</Link>
      </article>
    )
  }

  const accused = people.filter((p) => p.role === 'accused').map(personFullNameForRole)
  const nextHearing = hearings.find((h) => h.startsAt >= Date.now() - 12 * 3_600_000)
  const station = file.policeConnectionId ? connections?.find((c) => c.id === file.policeConnectionId)?.stationName : null
  const refs = [
    { label: referenceLabel('prosecution', m["file_ws.odpp_no"]), value: file.odppRegistrationNumber },
    { label: referenceLabel('police', m["file_ws.police_ref"]), value: file.policeReference },
    { label: referenceLabel('court', m["file_ws.court_no"]), value: file.courtCaseNumber },
  ]

  return (
    <div className="flex min-h-0 flex-1 items-start">
    <article className="page min-w-0">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1>{file.title}</h1>
              <FileStatusTag status={file.currentStatus} />
            </div>
            <p className="text-muted-foreground">
              {[file.policeStation, m["file_ws.received"]({ date: formatDate(file.receivedAt) }), station ? m["file_ws.via_connection"]({ station }) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="page-actions">
            <PanelButton label={m["file_ws.edit"]()} title={m["file_ws.edit_title"]()} description={m["file_ws.edit_description"]()} icon={false}>
              {({ close, setDirty }) => <EditProsecutionFileForm file={file} onSuccess={close} onDirtyChange={setDirty} />}
            </PanelButton>
          </div>
        </div>

        {/* The cover: the three numbers the file is known by, who and what it is about, and the next date. */}
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border/60 ring-1 ring-border/60 sm:grid-cols-3 lg:grid-cols-6">
          {refs.map((r) => (
            <div key={r.label} className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
              <dt className="truncate text-xs text-muted-foreground">{r.label}</dt>
              <dd className={cn('ms-0 truncate font-mono text-sm', !r.value && 'font-sans text-muted-foreground')}>{r.value || m["common.not_recorded"]()}</dd>
            </div>
          ))}
          <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{m["cover.accused"]()}</dt>
            <dd className={cn('ms-0 truncate', accused.length === 0 && 'text-muted-foreground')}>{accused.join(', ') || m["common.not_recorded"]()}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{m["cover.offence"]()}</dt>
            <dd className={cn('ms-0 truncate', charges.length === 0 && 'text-muted-foreground')}>
              {charges.length ? `${charges[0].offence}${charges.length > 1 ? ` +${charges.length - 1}` : ''}` : m["cover.no_charge"]()}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{m["cover.next_date"]()}</dt>
            <dd className={cn('ms-0 truncate', !nextHearing && 'text-muted-foreground')}>
              {nextHearing ? `${formatDate(nextHearing.startsAt)}, ${hearingKindLabel(nextHearing.kind)}` : m["cover.no_date"]()}
            </dd>
          </div>
        </dl>

      </header>

      <nav aria-label={m["file_ws.sections"]()} className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {fileTabs.map((item) => {
          const active = item.id === canonicalTab(tab)
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
              {item.id === 'papers' && papers.length ? <span className="rounded-full bg-secondary px-1.5 text-[0.625rem] leading-4 tabular-nums">{papers.length}</span> : null}
            </Link>
          )
        })}
      </nav>

      {canonicalTab(tab) === 'case' && <CaseTab file={file} />}
      {canonicalTab(tab) === 'papers' && (
        <div className="flex flex-col gap-8">
          <FileBinder fileId={fileId} />
          <Fold title={m["file_tab.details"]()}>
            <FilePanel fileId={fileId} />
          </Fold>
        </div>
      )}
      {canonicalTab(tab) === 'activity' && (
        <div className="flex flex-col gap-8">
          <ChronologyPanel fileId={fileId} />
        </div>
      )}
    </article>
    </div>
  )
}

/** The file itself: its references, the people on it, its tasks, its notes
 * and its own attachments. */
function FilePanel({ fileId }: { fileId: string }) {
  const { data: file } = useProsecutionFile(fileId)
  const { data: people } = useFilePeople(fileId)
  const unlink = useUnlinkPersonFromFile()
  if (!file) return null

  return (
    <div className="flex flex-col gap-6">
      <section className="page-section">
        <h2>{m["file_ws.references"]()}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={referenceLabel('prosecution', m["file_ws.odpp_no"])} value={file.odppRegistrationNumber} />
          <Fact label={referenceLabel('police', m["file_ws.police_ref"])} value={file.policeReference} />
          <Fact label={m["file_ws.police_station"]()} value={file.policeStation} />
          <Fact label={referenceLabel('court', m["file_ws.court_no"])} value={file.courtCaseNumber} />
        </dl>
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["nav.item.people"]()}</h2>
          <PanelButton label={m["file_ws.link_person"]()} title={m["file_ws.link_person"]()} description={m["file_ws.link_person_description"]()}>
            {({ close }) => <LinkPersonForm prosecutionFileId={fileId} onSuccess={close} />}
          </PanelButton>
        </div>
        {people.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">{m["file_ws.no_people"]()}</p>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {people.map((link) => (
              <div key={link.id} role="listitem" className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Tag tone="neutral">{filePersonRoles.find((r) => r.value === link.role)?.label ?? link.role}</Tag>
                  <span className="truncate">{personFullNameForRole(link)}</span>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => unlink.mutate(link.id)} aria-label={m["file_ws.remove_person"]({ name: personFullNameForRole(link) })}>
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <h2>{m["file_ws.tasks"]()}</h2>
        <FileTasks fileId={fileId} />
      </section>

      {file.notes && (
        <section className="page-section">
          <h2>{m["common.notes"]()}</h2>
          <RichTextPreview value={file.notes} />
        </section>
      )}

      <section className="page-section">
        <h2>{m["file_ws.attachments"]()}</h2>
        <AttachmentsField entityType={entityTypes.prosecutionFile} entityId={file.id} />
      </section>
    </div>
  )
}
