import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { format } from '@/lib/date'
import { ArrowUp01Icon, Delete02Icon, File01Icon, Folder01Icon, RecycleIcon, Undo02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useBin, useEmptyBin, usePurge, useRestore } from './queries'
import { ROOT, type BinEntry } from './schema'

const DAY = 24 * 60 * 60 * 1000
const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)
const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : m["library.failed"]())

/** Days left before an item is removed for good, counted up so "1 day left" is the last day. */
function daysLeft(entry: BinEntry) {
  const days = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / DAY))
  return days === 1 ? m["library.day_left"]() : m["library.days_left"]({ count: days })
}

/**
 * What was deleted from the library. Items stay thirty days, can be put back
 * where they were, or be deleted for good (one at a time, or all at once).
 * Deleting for good shreds the sealed files, so it asks first.
 */
export function RecycleBin({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { data: items = [] } = useBin()
  const restore = useRestore()
  const purge = usePurge()
  const empty = useEmptyBin()
  const [forever, setForever] = useState<BinEntry | 'all' | null>(null)

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work()
      return true
    } catch (e) {
      t.error(m["library.failed"](), { description: errorText(e) })
      return false
    }
  }

  const confirmForever = async () => {
    const target = forever
    setForever(null)
    if (!target) return
    const ok = await act(() => (target === 'all' ? empty.mutateAsync() : purge.mutateAsync(target)))
    if (ok) t.success(m["library.purged"](), { id: 'library-purged' })
  }

  return (
    <section className="flex flex-col gap-4" aria-label={m["library.bin"]()}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label={m["library.back"]()} title={m["library.back"]()} onClick={() => onNavigate(ROOT)}>
          <HugeiconsIcon icon={ArrowUp01Icon} />
        </Button>
        <h2 className="flex-1 text-base font-medium">{m["library.bin"]()}</h2>
        <Button size="sm" variant="destructive" disabled={items.length === 0} onClick={() => setForever('all')}>
          <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
          {m["library.empty_bin"]()}
        </Button>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">{m["library.bin_about"]()}</p>

      {items.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={RecycleIcon} />}>{m["library.bin_empty"]()}</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/70">
          {items.map((entry) => (
            <div key={`${entry.kind}:${entry.id}`} className="grid grid-cols-[minmax(0,1fr)_9rem_7rem_auto] items-center gap-3 px-3.5 py-2 text-sm odd:bg-foreground/[0.02]">
              <span className="flex min-w-0 items-center gap-3">
                <HugeiconsIcon icon={entry.kind === 'folder' ? Folder01Icon : File01Icon} className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{entry.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m["library.was_in"]({ where: entry.fromPath || m["library.title"]() })}
                    {entry.kind === 'folder' && entry.itemCount != null && entry.itemCount > 0 ? ` · ${m["files.items"]({ count: entry.itemCount })}` : ''}
                    {entry.sizeBytes != null ? ` · ${formatSize(entry.sizeBytes)}` : ''}
                  </span>
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums">{format(entry.deletedAt, 'd MMM yyyy, HH:mm')}</span>
              <span className="text-muted-foreground">{daysLeft(entry)}</span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (await act(() => restore.mutateAsync(entry))) t.success(m["library.restored"]({ name: entry.name }), { id: 'library-restored' })
                  }}
                >
                  <HugeiconsIcon icon={Undo02Icon} data-icon="inline-start" />
                  {m["library.restore"]()}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setForever(entry)}>
                  {m["library.delete_forever"]()}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={forever != null} onOpenChange={(o) => !o && setForever(null)}>
        <DialogContent>
          {forever && (
            <>
              <DialogHeader>
                <DialogTitle>{forever === 'all' ? m["library.empty_bin_title"]() : m["library.delete_title"]({ name: forever.name })}</DialogTitle>
                <DialogDescription>{forever === 'all' ? m["library.empty_bin_body"]() : forever.kind === 'folder' ? m["library.delete_folder"]() : m["library.delete_file"]()}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" size="sm" variant="secondary" onClick={() => setForever(null)}>
                  {m["library.cancel"]()}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void confirmForever()}>
                  {m["library.delete_forever"]()}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
