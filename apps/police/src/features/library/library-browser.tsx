import * as m from '@/paraglide/messages'
import { FileView, FileViewer, previewKind } from '@/components/file-viewer'
import { EmptyNote } from '@/components/planned'
import { downloadPath, saidSaved } from '@/lib/downloads'
import { format } from '@/lib/date'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  GridViewIcon,
  InformationCircleIcon,
  ListViewIcon,
  Delete02Icon,
  Download01Icon,
  File01Icon,
  FileAddIcon,
  FileScriptIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  FolderUploadIcon,
  Image01Icon,
  MoreHorizontalIcon,
  Pdf01Icon,
  PencilEdit01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { exportLibraryItem, readLibraryFile } from './data'
import { useVaultDirectory } from '@/features/files/queries'
import { folderNames, ORDER, readable } from '@/features/files/vault-browser'
import { useCreateFolder, useDeleteItem, useImport, useLibraryFolder, useLibrarySearch, useMoveItem, useRenameItem, useRestore } from './queries'
import { LibraryTree } from './library-tree'
import { BIN, ROOT, vaultPathOf, type LibraryEntry } from './schema'

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)

function iconFor(entry: LibraryEntry) {
  if (entry.kind === 'folder') return Folder01Icon
  const kind = previewKind(entry.name, entry.mimeType)
  if (kind === 'image') return Image01Icon
  if (kind === 'pdf') return Pdf01Icon
  if (kind === 'markdown' || kind === 'text') return FileScriptIcon
  return File01Icon
}

/** A setting kept on this computer, so the view the officer chose is the view they find next time. */
function useStored<T>(name: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(name)
      return raw == null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  })
  return [value, (next: T) => { setValue(next); try { localStorage.setItem(name, JSON.stringify(next)) } catch { /* private mode */ } }] as const
}

const kindOf = (e: LibraryEntry) => (e.kind === 'folder' ? m["library.kind_folder"]() : (e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1).toUpperCase() + ' ' : '') + m["library.kind_file"]())

const ROWS = 'grid grid-cols-[minmax(0,1fr)_9rem_6rem_7rem_2.5rem] items-center gap-3 px-3.5'

const sizeOf = (e: LibraryEntry) => (e.kind === 'folder' ? (e.itemCount != null ? (e.itemCount === 1 ? m["files.items_one"]() : m["files.items"]({ count: e.itemCount })) : '') : e.sizeBytes != null ? formatSize(e.sizeBytes) : '')

function MenuItem({ children, onClick, destructive }: { children: React.ReactNode; onClick: () => void; destructive?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn('rounded-lg px-2.5 py-1.5 text-left hover:bg-foreground/[0.06]', destructive && 'text-destructive')}>
      {children}
    </button>
  )
}

/** What is known about the picked item, or about the folder when nothing is picked. */
function DetailsPane({ entry, count, here, total }: { entry: LibraryEntry | null; count: number; here: string; total: number }) {
  const row = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
  return (
    <aside aria-label={m["library.details"]()} className="flex w-60 shrink-0 flex-col gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-border/70">
      {entry ? (
        <>
          <HugeiconsIcon icon={iconFor(entry)} className={cn('size-14', entry.kind === 'folder' ? 'text-primary/80' : 'text-muted-foreground')} strokeWidth={1.25} />
          <p className="break-words font-medium">{entry.name}</p>
          <dl className="flex flex-col gap-2.5">
            {row(m["library.type"](), kindOf(entry))}
            {sizeOf(entry) && row(m["library.size"](), sizeOf(entry))}
            {entry.modifiedAt > 0 && row(m["library.modified"](), format(entry.modifiedAt, 'd MMM yyyy, HH:mm'))}
            {entry.path != null && row(m["library.location"](), entry.path || m["library.title"]())}
            {entry.id.startsWith('v:') && row(m["library.location"](), m["library.filed"]())}
          </dl>
        </>
      ) : (
        <>
          <p className="font-medium">{count > 1 ? m["library.selected"]({ count }) : here}</p>
          <p className="text-muted-foreground">{count > 1 ? '' : total === 1 ? m["files.items_one"]() : m["files.items"]({ count: total })}</p>
          <p className="text-muted-foreground">{m["library.pick_one"]()}</p>
        </>
      )}
    </aside>
  )
}

let seeding: Promise<void> | null = null
function seedStarterFolders(existing: string[], make: (name: string) => Promise<unknown>) {
  try {
    if (localStorage.getItem('pleadli:library-seeded') === '1') return Promise.resolve()
    localStorage.setItem('pleadli:library-seeded', '1')
  } catch { /* private mode: the lock below still holds for this run */ }
  seeding ??= (async () => {
    const names = [m["library.starter_statements"](), m["library.starter_evidence"](), m["library.starter_court"](), m["library.starter_forms"](), m["library.starter_circulars"](), m["library.starter_reference"]()]
    for (const name of names) if (!existing.some((e) => e.toLowerCase() === name.toLowerCase())) await make(name).catch(() => undefined)
  })()
  return seeding
}

const key = (e: LibraryEntry) => `${e.kind}:${e.id}`
const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : m["library.failed"]())

type NameDialog = { mode: 'new' } | { mode: 'rename'; entry: LibraryEntry }

/**
 * The station's own library, a file manager the way an officer already uses
 * one: folders inside folders, a path to click back along, files dragged in
 * from the computer (or chosen), dragged between folders to move them,
 * searched by name across the whole library, and downloaded (a folder as one
 * .zip that keeps its structure). Everything is sealed like every other file.
 *
 * Moving by dragging uses pointer events, not the browser's own drag and drop:
 * on Windows the window's file-drop handler takes the browser's drag events
 * away, and that same handler is how files arrive from the computer.
 */
export function LibraryBrowser({ folderId, onNavigate }: { folderId: string; onNavigate: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const folder = useLibraryFolder(folderId)
  const found = useLibrarySearch(query.trim())
  const create = useCreateFolder()
  const rename = useRenameItem()
  const move = useMoveItem()
  const remove = useDeleteItem()
  const importer = useImport()
  const restore = useRestore()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [viewing, setViewing] = useState<LibraryEntry | null>(null)
  const [naming, setNaming] = useState<NameDialog | null>(null)
  const [nameText, setNameText] = useState('')
  const [nameProblem, setNameProblem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [outsideDrag, setOutsideDrag] = useState(false)
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const [view, setView] = useStored<'list' | 'grid'>('pleadli:library-view', 'list')
  const [showDetails, setShowDetails] = useStored<boolean>('pleadli:library-details', false)
  const [sort, setSort] = useState<{ by: 'name' | 'modified' | 'size'; down: boolean }>({ by: 'name', down: false })
  const [menu, setMenu] = useState<{ x: number; y: number; entry: LibraryEntry | null } | null>(null)

  const listing = folder.data
  const crumbs = listing?.crumbs ?? []
  // At the top of the library, the folders the app files by itself (a case's papers, a person's files) sit
  // beside the officer's own, so a station's cases are here from the first day. Those are opened, not edited.
  const { data: appFolders = [] } = useVaultDirectory('')
  const filed = useMemo<LibraryEntry[]>(() => {
    if (folderId !== ROOT || searching) return []
    const names = folderNames()
    const rank = (n: string) => (ORDER.indexOf(n) === -1 ? 500 : ORDER.indexOf(n))
    return appFolders
      .filter((e) => e.isDir && !e.name.startsWith('.') && e.name !== 'index' && e.name !== 'library')
      .sort((a, b) => rank(a.name) - rank(b.name))
      .map((e) => ({ id: `v:${e.name}`, kind: 'folder' as const, name: names[e.name] ?? readable(e.name), folderId: ROOT, sizeBytes: null, mimeType: null, modifiedAt: 0, itemCount: e.itemCount ?? null, path: null }))
  }, [appFolders, folderId, searching])
  const isFiled = (e: LibraryEntry) => e.id.startsWith('v:')
  const ordered = useMemo(() => {
    const dir = sort.down ? -1 : 1
    const by = (a: LibraryEntry, b: LibraryEntry) =>
      sort.by === 'modified' ? (a.modifiedAt - b.modifiedAt) * dir : sort.by === 'size' ? ((a.sizeBytes ?? a.itemCount ?? 0) - (b.sizeBytes ?? b.itemCount ?? 0)) * dir : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * dir
    // Folders stay above files, whatever the order, as in a file manager.
    return [...(listing?.entries ?? [])].sort((a, b) => (a.kind === b.kind ? by(a, b) : a.kind === 'folder' ? -1 : 1))
  }, [listing, sort])
  const entries = useMemo(() => (searching ? (found.data ?? []) : [...filed, ...ordered]), [searching, found.data, ordered, filed])

  // A station's first visit: the folders a police station already keeps its papers in, so the library
  // is never a blank page. Made once for the whole app (not once per screen), only the ones not already
  // there; deleting them later is the officer's choice and stays deleted.
  useEffect(() => {
    if (folderId !== ROOT || !folder.isSuccess || folder.isPlaceholderData || !listing) return
    void seedStarterFolders(listing.entries.map((e) => e.name), (name) => create.mutateAsync({ parentId: ROOT, name }))
  }, [folderId, folder.isSuccess, folder.isPlaceholderData, listing, create])
  const trail = crumbs.map((c) => c.id)
  const filedLinks = useMemo(() => appFolders.filter((e) => e.isDir && !e.name.startsWith('.') && e.name !== 'index' && e.name !== 'library').map((e) => ({ id: `v:${e.name}`, name: folderNames()[e.name] ?? readable(e.name), itemCount: e.itemCount ?? null })), [appFolders])
  const sortBy = (by: 'name' | 'modified' | 'size') => setSort((s) => ({ by, down: s.by === by ? !s.down : false }))
  const here = crumbs.length ? crumbs[crumbs.length - 1].name : m["library.title"]()
  const folderNameOf = (id: string) => (id === ROOT ? m["library.title"]() : (crumbs.find((c) => c.id === id)?.name ?? entries.find((e) => e.id === id)?.name ?? ''))

  // Leaving a folder (or starting a search) clears what was picked.
  useEffect(() => setSelected(new Set()), [folderId, searching])

  const chosen = entries.filter((e) => selected.has(key(e)))
  /** What can be renamed, deleted or dragged: only the officer's own, never what the app files. */
  const own = chosen.filter((e) => !isFiled(e))

  /** What a click does to the picked set, as in a file manager: plain picks one, Ctrl toggles, Shift extends. */
  const pick = (entry: LibraryEntry, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const id = key(entry)
    if (event.shiftKey && anchor) {
      const from = entries.findIndex((e) => key(e) === anchor)
      const to = entries.findIndex((e) => key(e) === id)
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        setSelected(new Set(entries.slice(a, b + 1).map(key)))
        return
      }
    }
    setAnchor(id)
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected)
      if (!next.delete(id)) next.add(id)
      setSelected(next)
    } else setSelected(new Set([id]))
  }

  const open = (entry: LibraryEntry) => {
    if (entry.kind === 'folder') {
      setQuery('')
      onNavigate(entry.id)
    } else setViewing(entry)
  }

  const guard = async <T,>(work: () => Promise<T>, doing?: string) => {
    try {
      return await work()
    } catch (e) {
      t.error(doing ?? m["library.failed"](), { description: errorText(e) })
      return undefined
    }
  }

  /** Runs a change and says whether it worked (a change returns nothing, so its result cannot tell). */
  const attempt = async (work: () => Promise<unknown>) => (await guard(async () => (await work(), true))) === true

  // ---- adding from the computer -------------------------------------------------

  const addPaths = async (paths: string[], into: string, files?: File[]) => {
    if (paths.length === 0 && !files?.length) return
    const result = await guard(() => importer.mutateAsync({ folderId: into, paths, files }))
    if (!result) return
    if (result.files > 0) t.success(result.files === 1 ? m["library.added_one"]() : m["library.added"]({ count: result.files }), { id: 'library-added' })
    if (result.failed.length > 0) t.error(m["library.not_added"]({ count: result.failed.length }), { id: 'library-not-added', description: result.failed.slice(0, 3).join(', ') })
  }
  const addRef = useRef(addPaths)
  addRef.current = addPaths

  const fileInput = useRef<HTMLInputElement>(null)
  const choose = async (directory: boolean) => {
    if (!isTauri()) {
      fileInput.current?.click()
      return
    }
    const { open: pickFiles } = await import('@tauri-apps/plugin-dialog')
    const picked = await pickFiles({ multiple: true, directory })
    if (!picked) return
    void addPaths(Array.isArray(picked) ? picked : [picked], folderId)
  }

  /** The folder row (or path link) under a point, so a drop lands where it is let go. */
  const folderAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-library-folder]')?.dataset.libraryFolder ?? null

  // Files arriving from the computer: the window reports their paths and where they were let go.
  const hereRef = useRef(folderId)
  hereRef.current = folderId
  useEffect(() => {
    if (!isTauri()) return
    let off: (() => void) | undefined
    let gone = false
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload
        if (p.type === 'leave') {
          setOutsideDrag(false)
          setDropTarget(null)
          return
        }
        const ratio = window.devicePixelRatio || 1
        const target = folderAt(p.position.x / ratio, p.position.y / ratio)
        if (p.type === 'drop') {
          setOutsideDrag(false)
          setDropTarget(null)
          void addRef.current(p.paths, target ?? hereRef.current)
        } else {
          setOutsideDrag(true)
          setDropTarget(target)
        }
      })
      if (gone) unlisten()
      else off = unlisten
    })
    return () => {
      gone = true
      off?.()
    }
  }, [])

  // ---- moving by dragging ---------------------------------------------------------

  const press = useRef<{ x: number; y: number; entry: LibraryEntry; dragging: boolean } | null>(null)
  const justDragged = useRef(false)
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen

  const startPress = (event: React.PointerEvent, entry: LibraryEntry) => {
    if (event.button !== 0 || searching || isFiled(entry) || (event.target as HTMLElement).closest('button, a, input')) return
    press.current = { x: event.clientX, y: event.clientY, entry, dragging: false }
    const dragged = () => (chosenRef.current.some((e) => key(e) === key(entry)) ? chosenRef.current : [entry])

    const onMove = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      p.dragging = true
      const items = dragged()
      setGhost({ x: e.clientX, y: e.clientY, label: items.length === 1 ? items[0].name : m["library.selected"]({ count: items.length }) })
      const target = folderAt(e.clientX, e.clientY)
      setDropTarget(target && !items.some((i) => i.kind === 'folder' && i.id === target) ? target : null)
    }
    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const p = press.current
      press.current = null
      setGhost(null)
      setDropTarget(null)
      if (!p?.dragging) return
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
      const target = folderAt(e.clientX, e.clientY)
      const items = dragged()
      if (!target || target === folderIdOf(items[0]) || items.some((i) => i.kind === 'folder' && i.id === target)) return
      void (async () => {
        for (const item of items) {
          const ok = await attempt(() => move.mutateAsync({ entry: item, destinationId: target }))
          if (!ok) return
        }
        t.success(m["library.moved"]({ folder: folderNameOf(target) }), { id: 'library-moved' })
      })()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const folderIdOf = (e: LibraryEntry) => e.folderId

  // ---- naming, deleting, downloading ------------------------------------------------

  const askName = (dialog: NameDialog) => {
    setNaming(dialog)
    setNameText(dialog.mode === 'rename' ? dialog.entry.name : '')
    setNameProblem(null)
  }
  const submitName = async () => {
    if (!naming) return
    try {
      if (naming.mode === 'new') await create.mutateAsync({ parentId: folderId, name: nameText })
      else await rename.mutateAsync({ entry: naming.entry, name: nameText })
      setNaming(null)
    } catch (e) {
      setNameProblem(errorText(e))
    }
  }

  /** Deleting is never final: it goes to the recycle bin and a toast offers Undo. */
  const binItems = async (items: LibraryEntry[]) => {
    const done: LibraryEntry[] = []
    for (const item of items) {
      if (!(await attempt(() => remove.mutateAsync(item)))) break
      done.push(item)
    }
    if (done.length === 0) return
    setSelected(new Set())
    t.success(done.length === 1 ? m["library.moved_to_bin"]({ name: done[0].name }) : m["library.moved_to_bin_many"]({ count: done.length }), {
      id: "library-binned",
      action: { label: m["library.undo"](), onClick: () => void attempt(async () => { for (const item of done) await restore.mutateAsync(item) }) },
    })
  }

  const download = async (entry: LibraryEntry) => {
    await guard(async () => {
      const path = await downloadPath(entry.kind === 'folder' ? `${entry.name}.zip` : entry.name)
      await exportLibraryItem(entry, path)
      saidSaved(path)
    })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea')) return
    if (event.key === 'Enter' && chosen.length === 1) open(chosen[0])
    else if (event.key === 'F2' && own.length === 1 && chosen.length === 1) askName({ mode: 'rename', entry: own[0] })
    else if (event.key === 'Delete' && own.length > 0) void binItems(own)
    else if (event.key === 'Backspace' && !searching && crumbs.length > 0) onNavigate(crumbs.length > 1 ? crumbs[crumbs.length - 2].id : ROOT)
    else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      setSelected(new Set(entries.map(key)))
    } else if (event.key === 'Escape') setSelected(new Set())
  }

  /** Pressing the right button on an item picks it first (unless it is already part of the pick), then opens its menu. */
  const contextOf = (entry: LibraryEntry) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.has(key(entry))) setSelected(new Set([key(entry)]))
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const rowFor = (entry: LibraryEntry) => {
    const isSelected = selected.has(key(entry))
    const isTarget = entry.kind === 'folder' && !isFiled(entry) && dropTarget === entry.id
    return (
      <div
        key={key(entry)}
        role="row"
        aria-selected={isSelected}
        data-library-folder={entry.kind === 'folder' && !isFiled(entry) ? entry.id : undefined}
        onPointerDown={(e) => startPress(e, entry)}
        onClick={(e) => !justDragged.current && pick(entry, e)}
        onDoubleClick={() => open(entry)}
        onContextMenu={contextOf(entry)}
        className={cn(ROWS, 'cursor-default select-none py-2 text-sm', isSelected ? 'bg-primary/10' : 'hover:bg-foreground/[0.03]', isTarget && 'bg-primary/20 ring-2 ring-inset ring-primary/60')}
      >
        <span className="flex min-w-0 items-center gap-3">
          <HugeiconsIcon icon={iconFor(entry)} className={cn('size-5 shrink-0', entry.kind === 'folder' ? 'text-primary/80' : 'text-muted-foreground')} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{entry.name}</span>
            {entry.path != null && <span className="truncate text-xs text-muted-foreground">{entry.path || m["library.title"]()}</span>}
          </span>
        </span>
        <span className="text-muted-foreground tabular-nums">{isFiled(entry) ? m["library.filed"]() : format(entry.modifiedAt, 'd MMM yyyy, HH:mm')}</span>
        <span className="text-right text-muted-foreground tabular-nums">{sizeOf(entry)}</span>
        <span className="truncate text-muted-foreground">{kindOf(entry)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon-sm" variant="ghost" aria-label={m["files.more"]()} title={m["files.more"]()} onClick={(e) => e.stopPropagation()}>
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => open(entry)}>{m["library.open"]()}</DropdownMenuItem>
            {!isFiled(entry) && (
              <>
                <DropdownMenuItem onClick={() => void download(entry)}>
                  <HugeiconsIcon icon={Download01Icon} />
                  {m["library.download"]()}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => askName({ mode: 'rename', entry })}>
                  <HugeiconsIcon icon={PencilEdit01Icon} />
                  {m["library.rename"]()}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void binItems(selected.has(key(entry)) && own.length > 1 ? own : [entry])}>
                  <HugeiconsIcon icon={Delete02Icon} />
                  {m["library.delete"]()}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  /** The same item as a large icon with its name below, for the icon view. */
  const tileFor = (entry: LibraryEntry) => {
    const isSelected = selected.has(key(entry))
    const isTarget = entry.kind === 'folder' && !isFiled(entry) && dropTarget === entry.id
    return (
      <div
        key={key(entry)}
        role="gridcell"
        aria-selected={isSelected}
        data-library-folder={entry.kind === 'folder' && !isFiled(entry) ? entry.id : undefined}
        onPointerDown={(e) => startPress(e, entry)}
        onClick={(e) => !justDragged.current && pick(entry, e)}
        onDoubleClick={() => open(entry)}
        onContextMenu={contextOf(entry)}
        title={entry.name}
        className={cn('flex cursor-default select-none flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-sm', isSelected ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-foreground/[0.04]', isTarget && 'bg-primary/20 ring-2 ring-primary/60')}
      >
        <HugeiconsIcon icon={iconFor(entry)} className={cn('size-12', entry.kind === 'folder' ? 'text-primary/80' : 'text-muted-foreground')} strokeWidth={1.25} />
        <span className="line-clamp-2 w-full break-words">{entry.name}</span>
        <span className="text-xs text-muted-foreground">{sizeOf(entry) || kindOf(entry)}</span>
      </div>
    )
  }

  const crumbLink = (id: string, label: string, last: boolean) => (
    <button
      type="button"
      data-library-folder={id}
      onClick={() => onNavigate(id)}
      className={cn('rounded px-1.5 py-0.5', last ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground', dropTarget === id && 'bg-primary/15 text-foreground')}
    >
      {label}
    </button>
  )

  return (
    <section className="relative flex flex-col gap-4 outline-none" tabIndex={0} onKeyDown={onKeyDown} aria-label={m["library.title"]()}
      onDragOver={(e) => !isTauri() && e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (isTauri() || e.dataTransfer.files.length === 0) return
        e.preventDefault()
        const target = (e.target as HTMLElement).closest<HTMLElement>("[data-library-folder]")?.dataset.libraryFolder
        void addPaths([], target ?? folderId, [...e.dataTransfer.files])
      }}
    >
      <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const picked = [...(e.target.files ?? [])]; e.target.value = ""; void addPaths([], folderId, picked) }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label={m["library.up"]()} title={m["library.up"]()} disabled={crumbs.length === 0 || searching} onClick={() => onNavigate(crumbs.length > 1 ? crumbs[crumbs.length - 2].id : ROOT)}>
          <HugeiconsIcon icon={ArrowUp01Icon} />
        </Button>
        <nav aria-label={m["library.where"]()} className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 rounded-lg bg-foreground/[0.045] px-2 py-1 text-sm">
          {crumbLink(ROOT, m["library.title"](), crumbs.length === 0)}
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-0.5">
              <span aria-hidden className="text-muted-foreground">›</span>
              {crumbLink(c.id, c.name, i === crumbs.length - 1)}
            </span>
          ))}
        </nav>
        <label className="flex h-9 w-56 items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
          <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m["library.search"]()}
            aria-label={m["library.search"]()}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div role="group" aria-label={m["library.view"]()} className="flex rounded-lg bg-foreground/[0.045] p-0.5">
          <Button size="icon-sm" variant={view === 'list' ? 'secondary' : 'ghost'} aria-pressed={view === 'list'} aria-label={m["library.view_list"]()} title={m["library.view_list"]()} onClick={() => setView('list')}>
            <HugeiconsIcon icon={ListViewIcon} />
          </Button>
          <Button size="icon-sm" variant={view === 'grid' ? 'secondary' : 'ghost'} aria-pressed={view === 'grid'} aria-label={m["library.view_grid"]()} title={m["library.view_grid"]()} onClick={() => setView('grid')}>
            <HugeiconsIcon icon={GridViewIcon} />
          </Button>
        </div>
        <Button size="icon-sm" variant={showDetails ? 'secondary' : 'ghost'} aria-pressed={showDetails} aria-label={m["library.details"]()} title={m["library.details"]()} onClick={() => setShowDetails(!showDetails)}>
          <HugeiconsIcon icon={InformationCircleIcon} />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => askName({ mode: 'new' })}>
          <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
          {m["library.new_folder"]()}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm">{m["library.add_files"]()}</Button>} />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => void choose(false)}>
              <HugeiconsIcon icon={FileAddIcon} />
              {m["library.add_files"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void choose(true)}>
              <HugeiconsIcon icon={FolderUploadIcon} />
              {m["library.add_folder"]()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-[30rem] gap-4">
        <LibraryTree current={folderId} trail={trail} filed={filedLinks} dropTarget={dropTarget} onNavigate={(id) => { setQuery(''); onNavigate(id) }} />

        <div className="flex min-w-0 flex-1 flex-col gap-2" onContextMenu={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-library-blank]')) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, entry: null }) } }}>
          <p className="text-[0.8125rem] text-muted-foreground">
            {searching ? m["library.found"]({ count: entries.length }) : chosen.length > 0 ? m["library.selected"]({ count: chosen.length }) : crumbs.length === 0 ? m["library.about"]() : `${here} · ${entries.length === 1 ? m["files.items_one"]() : m["files.items"]({ count: entries.length })}`}
          </p>

          {entries.length === 0 ? (
            <div data-library-blank className="flex-1">
              <EmptyNote icon={<HugeiconsIcon icon={FolderOpenIcon} />}>{searching ? m["library.no_match"]({ query: query.trim() }) : m["library.empty"]()}</EmptyNote>
            </div>
          ) : view === 'list' ? (
            <div role="grid" className="overflow-hidden rounded-xl bg-card ring-1 ring-border/70">
              <div role="row" className={cn(ROWS, 'border-b py-2 text-xs font-medium text-muted-foreground')}>
                {([['name', m["library.name"](), ''], ['modified', m["library.modified"](), ''], ['size', m["library.size"](), 'justify-end']] as const).map(([by, label, align]) => (
                  <button key={by} type="button" onClick={() => sortBy(by)} className={cn('flex items-center gap-1 text-left hover:text-foreground', align)}>
                    {label}
                    {sort.by === by && <HugeiconsIcon icon={sort.down ? ArrowDown01Icon : ArrowUp01Icon} className="size-3" />}
                  </button>
                ))}
                <span>{m["library.type"]()}</span>
                <span />
              </div>
              {entries.map((entry) => rowFor(entry))}
              <div data-library-blank className="h-10" />
            </div>
          ) : (
            <div data-library-blank className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] content-start gap-2">
              {entries.map((entry) => tileFor(entry))}
            </div>
          )}
        </div>

        {showDetails && <DetailsPane entry={chosen.length === 1 ? chosen[0] : null} count={chosen.length} here={here} total={entries.length} />}
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }} className="fixed z-50 flex w-52 flex-col rounded-xl bg-popover p-1 text-sm shadow-lg ring-1 ring-border" onClick={() => setMenu(null)}>
            {menu.entry ? (
              <>
                <MenuItem onClick={() => open(menu.entry!)}>{m["library.open"]()}</MenuItem>
                {!isFiled(menu.entry) && (
                  <>
                    <MenuItem onClick={() => void download(menu.entry!)}>{m["library.download"]()}</MenuItem>
                    <MenuItem onClick={() => askName({ mode: 'rename', entry: menu.entry! })}>{m["library.rename"]()}</MenuItem>
                    <div className="my-1 h-px bg-border" />
                    <MenuItem destructive onClick={() => void binItems(selected.has(key(menu.entry!)) && own.length > 1 ? own : [menu.entry!])}>{m["library.delete"]()}</MenuItem>
                  </>
                )}
              </>
            ) : (
              <>
                <MenuItem onClick={() => askName({ mode: 'new' })}>{m["library.new_folder"]()}</MenuItem>
                <MenuItem onClick={() => void choose(false)}>{m["library.add_files"]()}</MenuItem>
                <MenuItem onClick={() => void choose(true)}>{m["library.add_folder"]()}</MenuItem>
                <div className="my-1 h-px bg-border" />
                <MenuItem onClick={() => setView(view === 'list' ? 'grid' : 'list')}>{view === 'list' ? m["library.view_grid"]() : m["library.view_list"]()}</MenuItem>
                <MenuItem onClick={() => onNavigate(BIN)}>{m["library.bin"]()}</MenuItem>
              </>
            )}
          </div>
        </>
      )}

      {outsideDrag && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5">
          <span className="rounded-lg bg-popover px-4 py-2 text-sm font-medium shadow-md">{m["library.drop_here"]({ folder: dropTarget ? folderNameOf(dropTarget) : here })}</span>
        </div>
      )}

      {ghost && (
        <div className="pointer-events-none fixed z-50 flex max-w-64 items-center gap-2 rounded-lg bg-popover px-3 py-1.5 text-sm shadow-lg ring-1 ring-border" style={{ left: ghost.x + 14, top: ghost.y + 14 }}>
          <HugeiconsIcon icon={File01Icon} className="size-4" />
          <span className="truncate">{ghost.label}</span>
        </div>
      )}

      <Dialog open={naming != null} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitName()
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>{naming?.mode === 'rename' ? m["library.rename"]() : m["library.new_folder"]()}</DialogTitle>
              <DialogDescription>{naming?.mode === 'rename' ? naming.entry.name : here}</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={nameText} onChange={(e) => setNameText(e.target.value)} aria-label={m["library.name_label"]()} aria-invalid={nameProblem != null} placeholder={m["library.name_label"]()} />
            {nameProblem && <p className="text-sm text-destructive">{nameProblem}</p>}
            <DialogFooter>
              <Button type="button" size="sm" variant="secondary" onClick={() => setNaming(null)}>
                {m["library.cancel"]()}
              </Button>
              <Button type="submit" size="sm" disabled={nameText.trim() === ''}>
                {naming?.mode === 'rename' ? m["library.save"]() : m["library.create"]()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {viewing && (
        <FileViewer
          open
          onOpenChange={(o) => !o && setViewing(null)}
          title={viewing.name}
          detail={format(viewing.modifiedAt, 'd MMM yyyy, HH:mm')}
          onOpenOutside={() => void invoke('open_vault_path', { relativePath: vaultPathOf(viewing) }).catch((e) => t.error(m["library.failed"](), { description: errorText(e) }))}
        >
          <FileView name={viewing.name} mime={viewing.mimeType} queryKey={['library-file', viewing.id]} load={() => readLibraryFile(viewing)} className="min-h-0 flex-1" />
        </FileViewer>
      )}
    </section>
  )
}
