import * as m from '@/paraglide/messages'
import { FileView, FileViewer, previewKind } from '@/components/file-viewer'
import { EmptyNote } from '@/components/planned'
import { getAttachmentRoute } from '@/features/attachments/data'
import { formatFileSize, openVaultEntry, pathSegments, readVaultFile, revealVaultEntry, useVaultDirectory, type VaultEntry } from './index'
import { peopleSearchOptions } from '@/features/people'
import { format } from '@/lib/date'
import { t } from '@pleadli/ui/goey-toaster'
import {
  File01Icon,
  FileScriptIcon,
  Folder01Icon,
  FolderOpenIcon,
  Image01Icon,
  MoreHorizontalIcon,
  Pdf01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useMemo, useState } from 'react'

/** The folders the station's records file themselves into, in the order an
 * officer looks for them, under the names an officer uses. A folder the app
 * does not know keeps its own name, made readable. */
const folderNames = (): Record<string, string> => ({
  cases: m["nav.cases"](),
  people: m["nav.people"](),
  incidents: m["nav.incidents"](),
  custody: m["nav.in_custody"](),
  bonds: m["nav.bonds_and_sureties"](),
  'station-diary': m["nav.station_diary"](),
  statements: m["nav.statements"](),
  evidence: m["nav.exhibits"](),
  exhibits: m["nav.exhibits"](),
  forms: m["nav.charge_sheets"](),
  'charge-sheets': m["nav.charge_sheets"](),
  referrals: m["nav.referrals"](),
  documents: m["files.case_documents"](),
  duty: m["nav.duty_roster"](),
  vehicle: m["nav.vehicles"](),
  vehicles: m["nav.vehicles"](),
  stores: m["files.stores"](),
  armory: m["nav.armory"](),
  impounded: m["nav.impounded_assets"](),
  station_profile: m["nav.station_profile"](),
  officer_check_in: m["files.check_ins"](),
  station_establishment_member: m["nav.officers"](),
  officers: m["nav.officers"](),
  index: m["files.indexes"](),
})
const ORDER = ['cases', 'people', 'incidents', 'custody', 'bonds', 'station-diary', 'statements', 'documents', 'evidence', 'forms', 'referrals', 'duty', 'vehicle', 'stores', 'station_profile']

const readable = (name: string) => name.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function fileIcon(entry: VaultEntry) {
  const kind = previewKind(entry.name, entry.mimeType)
  if (kind === 'image') return Image01Icon
  if (kind === 'pdf') return Pdf01Icon
  if (kind === 'markdown' || kind === 'text') return FileScriptIcon
  return File01Icon
}

/** The station folder on disk, by case, person and
 * register, the way a records office keeps it. Every file opens here, in the
 * app; another program is only ever a choice. */
export function VaultBrowser({ path }: { path: string }) {
  const navigate = useNavigate()
  const { data: entries = [] } = useVaultDirectory(path)
  const { data: people = [] } = useQuery(peopleSearchOptions(''))
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<VaultEntry | null>(null)
  const names = folderNames()

  /** A folder's name: a person's folder is the person, a case's folder its reference. */
  const folderLabel = (segment: string, parent: string) => {
    if (parent === 'people') {
      const person = people.find((p) => p.id === segment)
      if (person) return [person.firstName, person.otherNames, person.lastName].filter(Boolean).join(' ')
    }
    return names[segment] ?? readable(segment)
  }
  const fileLabel = (entry: VaultEntry) => {
    if (entry.title) return entry.title
    if (entry.entityType) return names[entry.entityType] ?? readable(entry.entityType)
    return entry.name
  }

  const crumbs = pathSegments(path)
  const parentOf = (index: number) => (index === 0 ? '' : crumbs[index - 1].label)
  const here = crumbs.length ? folderLabel(crumbs[crumbs.length - 1].label, parentOf(crumbs.length - 1)) : m["nav.documents"]()

  const { folders, files } = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const parent = crumbs[crumbs.length - 1]?.label ?? ''
    const visible = entries.filter((e) => e.name !== 'README.md' && !e.name.startsWith('.'))
    const matches = (label: string) => !needle || label.toLowerCase().includes(needle)
    const rank = (name: string) => (name === 'index' ? 999 : ORDER.indexOf(name) === -1 ? 500 : ORDER.indexOf(name))
    return {
      folders: visible
        .filter((e) => e.isDir)
        .map((e) => ({ entry: e, label: folderLabel(e.name, parent) }))
        .filter((f) => matches(f.label))
        .sort((a, b) => rank(a.entry.name) - rank(b.entry.name) || a.label.localeCompare(b.label)),
      files: visible
        .filter((e) => !e.isDir)
        .map((e) => ({ entry: e, label: fileLabel(e) }))
        .filter((f) => matches(f.label))
        .sort((a, b) => (b.entry.modifiedAt ?? 0) - (a.entry.modifiedAt ?? 0)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query, people, path])

  const openRecord = async (entry: VaultEntry) => {
    if (!entry.entityType || !entry.entityId) return
    try {
      const route = await getAttachmentRoute(entry.entityType, entry.entityId)
      void navigate({ to: route } as never)
    } catch {
      t.error(m["files.open_failed"]())
    }
  }

  /** A link inside a note ("index/people.md") opens that file here too. */
  const followLink = (href: string) => {
    if (/^[a-z]+:/i.test(href)) return
    const base = viewing ? viewing.relativePath.split('/').slice(0, -1) : []
    const parts = [...base]
    for (const part of href.split('/')) {
      if (part === '..') parts.pop()
      else if (part && part !== '.') parts.push(part)
    }
    const target = parts.join('/')
    const name = parts[parts.length - 1] ?? target
    setViewing({ name, relativePath: target, isDir: false, sizeBytes: null, modifiedAt: null, attachmentId: null, entityType: null, entityId: null, mimeType: null, title: null })
  }

  const total = folders.length + files.length

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <div>
          {crumbs.length > 0 && (
            <nav aria-label={m["files.where"]()} className="flex flex-wrap items-center gap-1 text-[0.8125rem] text-muted-foreground">
              <Link to="/search/files" search={{ view: 'vault', path: '' }} className="text-muted-foreground no-underline hover:text-foreground">
                {m["files.station_folder"]()}
              </Link>
              {crumbs.slice(0, -1).map((crumb, index) => (
                <span key={crumb.path} className="flex items-center gap-1">
                  <span aria-hidden>›</span>
                  <Link to="/search/files" search={{ view: 'vault', path: crumb.path }} className="text-muted-foreground no-underline hover:text-foreground">
                    {folderLabel(crumb.label, parentOf(index))}
                  </Link>
                </span>
              ))}
            </nav>
          )}
          <h2>{crumbs.length === 0 ? m["files.station_folder"]() : here}</h2>
          <p>{crumbs.length === 0 ? m["files.station_folder_about"]() : total === 1 ? m["files.items_one"]() : m["files.items"]({ count: total })}</p>
        </div>
      </header>

      {entries.length > 0 && (
        <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
          <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m["files.search"]()}
            aria-label={m["files.search"]()}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      {total === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={FolderOpenIcon} />}>{query ? m["files.no_match"]({ query }) : m["files.empty"]()}</EmptyNote>
      ) : (
        <>
          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {folders.map(({ entry, label }) => (
                <Link
                  key={entry.relativePath}
                  to="/search/files"
                  search={{ view: 'vault', path: entry.relativePath }}
                  className="flex min-w-0 items-center gap-3 rounded-xl bg-card px-3.5 py-3 text-foreground no-underline shadow-xs ring-1 ring-border/70 transition-colors hover:bg-foreground/[0.03]"
                >
                  <HugeiconsIcon icon={Folder01Icon} className="size-7 shrink-0 text-primary/80" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{label}</span>
                    {entry.itemCount != null && (
                      <span className="text-[0.8125rem] text-muted-foreground">{entry.itemCount === 1 ? m["files.items_one"]() : m["files.items"]({ count: entry.itemCount })}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <Group>
              {files.map(({ entry, label }) => (
                <GroupRow
                  key={entry.relativePath}
                  icon={
                    <RowIcon>
                      <HugeiconsIcon icon={fileIcon(entry)} />
                    </RowIcon>
                  }
                  label={label}
                  detail={[entry.modifiedAt ? format(entry.modifiedAt, 'd MMM yyyy, HH:mm') : null, entry.sizeBytes != null ? formatFileSize(entry.sizeBytes) : null].filter(Boolean).join(' · ')}
                  onClick={() => setViewing(entry)}
                  value={
                    <span onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button size="icon-sm" variant="ghost" aria-label={m["files.more"]()} title={m["files.more"]()}>
                              <HugeiconsIcon icon={MoreHorizontalIcon} />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => setViewing(entry)}>{m["files.view"]()}</DropdownMenuItem>
                          {entry.entityType && entry.entityId && <DropdownMenuItem onClick={() => void openRecord(entry)}>{m["files.open_record"]()}</DropdownMenuItem>}
                          {isTauri() && <DropdownMenuItem onClick={() => void openVaultEntry(entry)}>{m["viewer.open_outside"]()}</DropdownMenuItem>}
                          {isTauri() && <DropdownMenuItem onClick={() => void revealVaultEntry(entry)}>{m["files.reveal"]()}</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  }
                />
              ))}
            </Group>
          )}
        </>
      )}

      {viewing && (
        <FileViewer
          open
          onOpenChange={(open) => !open && setViewing(null)}
          title={fileLabel(viewing)}
          detail={viewing.modifiedAt ? format(viewing.modifiedAt, 'd MMM yyyy, HH:mm') : undefined}
          onOpenOutside={isTauri() ? () => void openVaultEntry(viewing) : undefined}
        >
          <FileView
            name={viewing.name}
            mime={viewing.mimeType}
            queryKey={['vault', viewing.relativePath]}
            load={() => readVaultFile(viewing.relativePath)}
            onLink={followLink}
            className="min-h-0 flex-1"
          />
        </FileViewer>
      )}
    </section>
  )
}
