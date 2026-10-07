import * as m from '@/paraglide/messages'
import { FileView, FileViewer, previewKind } from '@/components/file-viewer'
import { EmptyNote } from '@/components/planned'
import { allAttachmentsOptions, getAttachmentDataUrl, getAttachmentRoute, openAttachment, useAttachmentDataUrl, type Attachment } from '@/features/attachments'
import { VaultBrowser } from '@/features/files/vault-browser'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { File01Icon, File02Icon, FileScriptIcon, MoreHorizontalIcon, Pdf01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { t } from '@pleadli/ui/goey-toaster'
import { Segmented } from '@pleadli/ui/segmented'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useMemo, useState } from 'react'

type View = 'papers' | 'files' | 'vault'

export const Route = createFileRoute('/_public/search/files')({
  validateSearch: (search: Record<string, unknown>): { view?: View; path?: string } => ({
    ...(search.view === 'files' || search.view === 'vault' ? { view: search.view } : {}),
    ...(typeof search.path === 'string' && search.path ? { path: search.path } : {}),
  }),
  component: RouteComponent,
})

type LibraryPaper = { code: string; entityType: string; entityId: string; reference: string | null; title: string; printedBy: string | null; printedAt: number; route: string }
const libraryOptions = () => queryOptions({ queryKey: ['prints', 'library'], queryFn: () => api('/prints/library') as Promise<LibraryPaper[]> })

/** What a record kind is called, for the line under a paper or file. */
const kindNames = (): Record<string, string> => ({
  person: m["nav.people"](),
  case: m["nav.cases"](),
  incident: m["nav.incidents"](),
  statement: m["nav.statements"](),
  custody_record: m["nav.in_custody"](),
  bond: m["nav.bonds_and_sureties"](),
  station_diary_entry: m["nav.station_diary"](),
  station_diary_day: m["nav.station_diary"](),
  exhibit: m["nav.exhibits"](),
  charge_sheet: m["nav.charge_sheets"](),
  referral: m["nav.referrals"](),
  vehicle: m["nav.vehicles"](),
  station_asset: m["files.stores"](),
  duty_assignment: m["nav.duty_roster"](),
})

/** A paper drawn small, as Pages shows one in its browser. */
function PaperThumb({ paper, onOpen }: { paper: LibraryPaper; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group flex min-w-0 cursor-pointer flex-col gap-2 text-left">
      <div className="relative flex aspect-[210/297] w-full flex-col items-center gap-1.5 overflow-hidden rounded-md bg-white p-[9%] shadow-sm ring-1 ring-black/10 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <span className="mb-1 size-[16%] rounded-full bg-zinc-200" />
        <span className="h-[2.2%] w-[60%] rounded-sm bg-zinc-300" />
        <span className="mb-[6%] line-clamp-2 text-center font-serif text-[0.5625rem] leading-tight font-bold text-zinc-800 uppercase">{paper.title}</span>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="h-[1.6%] rounded-sm bg-zinc-200" style={{ width: `${i % 3 === 2 ? 70 : 100}%` }} />
        ))}
        <span className="absolute right-[9%] bottom-[6%] size-[14%] rounded-[2px] bg-[repeating-conic-gradient(#27272a_0_25%,#fff_0_50%)] bg-[length:25%_25%]" />
      </div>
      <span className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-[0.8125rem] font-medium">{paper.title}</span>
        <span className="truncate text-xs text-muted-foreground">{paper.reference ?? kindNames()[paper.entityType] ?? ''}</span>
        <span className="truncate text-xs text-muted-foreground">{format(paper.printedAt, 'd MMM yyyy')}</span>
      </span>
    </button>
  )
}

/** A file drawn small: the photo itself, or the kind of file. */
function FileThumb({ file, onOpen }: { file: Attachment; onOpen: () => void }) {
  const kind = previewKind(file.fileName, file.mimeType)
  const { data: src } = useAttachmentDataUrl(kind === 'image' ? file.id : null)
  const icon = kind === 'pdf' ? Pdf01Icon : kind === 'markdown' || kind === 'text' ? FileScriptIcon : File01Icon
  return (
    <button type="button" onClick={onOpen} className="group flex min-w-0 cursor-pointer flex-col gap-2 text-left">
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.04] ring-1 ring-black/10 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        {src ? <img src={src} alt={file.fileName} className="h-full w-full object-cover" /> : <HugeiconsIcon icon={icon} className="size-10 text-muted-foreground/70" />}
      </div>
      <span className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-[0.8125rem] font-medium">{file.fileName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {kindNames()[file.entityType] ?? ''} · {format(file.createdAt, 'd MMM yyyy')}
        </span>
      </span>
    </button>
  )
}

/**
 * Documents: what the station has put on paper, and every file attached to
 * its records. Papers open as their record's paper; files open here in the
 * viewer. The folder on disk is there for whoever needs it, behind "···".
 */
function RouteComponent() {
  const { view = 'papers', path = '' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: papers = [] } = useQuery(libraryOptions())
  const { data: files = [] } = useQuery(allAttachmentsOptions(''))
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const kinds = kindNames()

  const needle = query.trim().toLowerCase()
  const shownPapers = useMemo(() => papers.filter((p) => !needle || [p.title, p.reference ?? '', p.code, kinds[p.entityType] ?? ''].some((s) => s.toLowerCase().includes(needle))), [papers, needle, kinds])
  const shownFiles = useMemo(
    () => files.filter((f) => !needle || [f.fileName, kinds[f.entityType] ?? ''].some((s) => s.toLowerCase().includes(needle))).sort((a, b) => b.createdAt - a.createdAt),
    [files, needle, kinds],
  )

  const openRoute = (route: string) => void navigate(parseSearchRoute(route) as never)
  const openRecord = async (file: Attachment) => {
    try {
      openRoute(await getAttachmentRoute(file.entityType, file.entityId))
    } catch {
      t.error(m["files.open_failed"]())
    }
  }
  const setView = (next: View) => void navigate({ to: '/search/files', search: next === 'papers' ? {} : { view: next }, replace: true })

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.documents"]()}</h1>
          <p>{m["files.subtitle"]({ papers: papers.length, files: files.length })}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view === 'vault' ? 'papers' : view}
            onChange={setView}
            items={[
              { value: 'papers', label: m["files.papers"]() },
              { value: 'files', label: m["files.files"]() },
            ]}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="secondary" aria-label={m["files.more"]()} title={m["files.more"]()}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setView('vault')}>{m["files.station_folder"]()}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {view === 'vault' ? (
        <VaultBrowser path={path} />
      ) : (
        <>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={view === 'papers' ? m["files.search_papers"]() : m["files.search_files"]()}
              aria-label={view === 'papers' ? m["files.search_papers"]() : m["files.search_files"]()}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          {view === 'papers' &&
            (shownPapers.length === 0 ? (
              <EmptyNote icon={<HugeiconsIcon icon={File02Icon} />}>{needle ? m["files.no_match"]({ query }) : m["files.no_papers"]()}</EmptyNote>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {shownPapers.map((p) => (
                  <PaperThumb key={`${p.entityType}-${p.entityId}`} paper={p} onOpen={() => openRoute(p.route)} />
                ))}
              </div>
            ))}

          {view === 'files' &&
            (shownFiles.length === 0 ? (
              <EmptyNote icon={<HugeiconsIcon icon={File01Icon} />}>{needle ? m["files.no_match"]({ query }) : m["files.no_files"]()}</EmptyNote>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {shownFiles.map((f) => (
                  <FileThumb key={f.id} file={f} onOpen={() => setViewing(f)} />
                ))}
              </div>
            ))}
        </>
      )}

      {viewing && (
        <FileViewer
          open
          onOpenChange={(open) => !open && setViewing(null)}
          title={viewing.fileName}
          detail={`${kinds[viewing.entityType] ?? ''} · ${format(viewing.createdAt, 'd MMM yyyy, HH:mm')}`}
          onOpenOutside={isTauri() ? () => void openAttachment(viewing) : undefined}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <FileView name={viewing.fileName} mime={viewing.mimeType} queryKey={['attachment', viewing.id]} load={() => getAttachmentDataUrl(viewing.id)} className="min-h-0 flex-1" />
            <Button size="sm" variant="ghost" className="self-start" onClick={() => void openRecord(viewing)}>
              {m["files.open_record"]()}
            </Button>
          </div>
        </FileViewer>
      )}
    </article>
  )
}
