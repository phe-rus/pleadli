import * as m from '@/paraglide/messages'
import { ArrowDown01Icon, ArrowRight01Icon, Delete02Icon, Folder01Icon, FolderOpenIcon, Home01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { libraryFolderOptions } from './queries'
import { BIN, ROOT } from './schema'

type Link = { id: string; name: string; itemCount: number | null }

/**
 * The folder pane on the left, as in Windows Explorer or the Finder sidebar:
 * the places that are always there (the library itself, the folders the app
 * files by itself, the recycle bin), then the officer's own folders as a tree
 * that opens one level at a time. Each row is also a drop target, so a file
 * can be dragged straight onto a folder here.
 */
export function LibraryTree({
  current,
  trail,
  filed,
  dropTarget,
  onNavigate,
}: {
  current: string
  /** The ids from the top down to the folder on screen, kept open. */
  trail: string[]
  filed: Link[]
  dropTarget: string | null
  onNavigate: (id: string) => void
}) {
  return (
    <nav aria-label={m["library.folders"]()} className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto pr-1 text-sm">
      <Row icon={Home01Icon} label={m["library.title"]()} active={current === ROOT} id={ROOT} dropTarget={dropTarget} onClick={() => onNavigate(ROOT)} />
      <Children parentId={ROOT} depth={0} current={current} trail={trail} dropTarget={dropTarget} onNavigate={onNavigate} />
      {filed.length > 0 && <p className="mt-3 px-2 pb-1 text-xs font-medium text-muted-foreground">{m["library.kept_by_pleadli"]()}</p>}
      {filed.map((f) => (
        <Row key={f.id} icon={Folder01Icon} label={f.name} active={current === f.id} onClick={() => onNavigate(f.id)} count={f.itemCount} />
      ))}
      <p className="mt-3 px-2 pb-1 text-xs font-medium text-muted-foreground">{m["library.places"]()}</p>
      <Row icon={Delete02Icon} label={m["library.bin"]()} active={current === BIN} onClick={() => onNavigate(BIN)} />
    </nav>
  )
}

function Row({
  icon,
  label,
  active,
  onClick,
  id,
  dropTarget,
  depth = 0,
  open,
  onToggle,
  hasChildren,
  count,
}: {
  icon: typeof Folder01Icon
  label: string
  active: boolean
  onClick: () => void
  id?: string
  dropTarget?: string | null
  depth?: number
  open?: boolean
  onToggle?: () => void
  hasChildren?: boolean
  count?: number | null
}) {
  return (
    <div
      data-library-folder={id}
      style={{ paddingLeft: 4 + depth * 14 }}
      className={cn('flex items-center gap-0.5 rounded-lg py-1 pr-2', active ? 'bg-primary/10 font-medium text-foreground' : 'text-foreground/80 hover:bg-foreground/[0.05]', id && dropTarget === id && 'bg-primary/20 ring-2 ring-primary/60')}
    >
      <button type="button" tabIndex={-1} aria-hidden={!hasChildren} onClick={onToggle} className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/10', !hasChildren && 'invisible')}>
        <HugeiconsIcon icon={open ? ArrowDown01Icon : ArrowRight01Icon} className="size-3.5" />
      </button>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <HugeiconsIcon icon={open && active ? FolderOpenIcon : icon} className={cn('size-4 shrink-0', icon === Folder01Icon || icon === FolderOpenIcon ? 'text-primary/80' : 'text-muted-foreground')} />
        <span className="truncate">{label}</span>
        {count != null && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>}
      </button>
    </div>
  )
}

/** The folders directly inside one folder, fetched only once its parent is opened. */
function Children({ parentId, depth, current, trail, dropTarget, onNavigate }: { parentId: string; depth: number; current: string; trail: string[]; dropTarget: string | null; onNavigate: (id: string) => void }) {
  const { data } = useQuery(libraryFolderOptions(parentId))
  const folders = (data?.entries ?? []).filter((e) => e.kind === 'folder')
  return folders.map((f) => <Node key={f.id} folder={f} depth={depth + 1} current={current} trail={trail} dropTarget={dropTarget} onNavigate={onNavigate} />)
}

function Node({ folder, depth, current, trail, dropTarget, onNavigate }: { folder: Link & { kind: string }; depth: number; current: string; trail: string[]; dropTarget: string | null; onNavigate: (id: string) => void }) {
  // A folder on the way to the one on screen opens by itself; the officer's own toggling wins after that.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? trail.includes(folder.id)
  return (
    <>
      <Row
        icon={Folder01Icon}
        label={folder.name}
        id={folder.id}
        active={current === folder.id}
        depth={depth}
        open={open}
        hasChildren={folder.itemCount == null || folder.itemCount > 0}
        dropTarget={dropTarget}
        onToggle={() => setChosen(!open)}
        onClick={() => onNavigate(folder.id)}
      />
      {open && <Children parentId={folder.id} depth={depth} current={current} trail={trail} dropTarget={dropTarget} onNavigate={onNavigate} />}
    </>
  )
}
