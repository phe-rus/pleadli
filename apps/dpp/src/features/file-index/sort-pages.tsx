import { DocumentView } from '@/components/document-viewer'
import { useProsecutionFile } from '@/features/prosecution-files/queries'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import type { FileItem } from './data'
import { KindSelect, kindLabel } from './file-index'
import { usePageCount } from './page-count'
import { useSplitFileItem } from './queries'

type Start = { kind: string; title: string }

/** Sort a scan into its papers by hand, as the Papers board lays it out: the
 * pages as scanned across the top with a blue edge where a paper starts, the
 * page being looked at below, and the papers so far down the right. No reading
 * by machine is involved, so it works with Assist off and no network. */
export function SortPages({ item, fileId, onClose, onSaved }: { item: FileItem; fileId: string; onClose: () => void; onSaved: () => void }) {
  const { data: total = 1, isLoading } = usePageCount(item.attachmentId)
  const { data: file } = useProsecutionFile(fileId)
  const split = useSplitFileItem(fileId)
  const first = item.pageFrom ?? 1
  const last = item.pageTo ?? total
  const [looking, setLooking] = useState(first)
  const [starts, setStarts] = useState<Record<number, Start>>({ [first]: { kind: item.kind, title: item.title } })

  const pages = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i)
  const marked = Object.keys(starts).map(Number).sort((a, b) => a - b)
  const missingTitle = marked.some((p) => !starts[p].title.trim())
  const paperOf = (page: number) => marked.filter((p) => p <= page).pop() ?? first
  const current = paperOf(looking)
  const papers = marked.map((from, i) => ({ from, to: (marked[i + 1] ?? last + 1) - 1, ...starts[from] }))
  const range = (from: number, to: number) => (from === to ? m['sort.pages_one']({ from }) : m['sort.pages_range']({ from, to }))

  const toggle = (page: number, on: boolean) =>
    setStarts((all) => {
      const next = { ...all }
      if (on) next[page] = { kind: 'other', title: '' }
      else delete next[page]
      return next
    })
  const change = (page: number, patch: Partial<Start>) => setStarts((all) => ({ ...all, [page]: { ...all[page], ...patch } }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[96dvh] w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[98vw]">
        <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-border px-8 py-4">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-xl font-semibold">
              {file?.title ?? ''} · {m['sort.title']()}
            </DialogTitle>
            <DialogDescription className="text-[13px]">{m['sort.subtitle']({ pages: pages.length })}</DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {m['common.cancel']()}
            </Button>
            <Button disabled={missingTitle || split.isPending || isLoading} onClick={() => split.mutate({ id: item.id, pageCount: total, starts: marked.map((p) => ({ pageFrom: p, ...starts[p] })) }, { onSuccess: onSaved })}>
              {m['sort.save']()}
            </Button>
          </div>
        </header>

        {isLoading || !item.attachmentId ? (
          <div className="m-8 h-[60dvh] animate-pulse rounded-xl bg-secondary" />
        ) : (
          <div className="flex min-h-0 flex-1 flex-wrap">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 overflow-y-auto bg-secondary/50 px-8 py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m['sort.scanned_label']()}</h2>
                <span className="text-xs text-muted-foreground">{m['sort.tap_hint']()}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pages.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setLooking(page)}
                    aria-pressed={looking === page}
                    className={cn(
                      'flex h-[62px] w-11 cursor-pointer items-end justify-center rounded-md border border-border bg-background pb-1 text-xs tabular-nums text-muted-foreground',
                      starts[page] && 'border-l-[5px] border-l-[#0071e3]',
                      looking === page && 'text-foreground outline-2 outline-offset-1 outline-primary',
                    )}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <DocumentView key={looking} attachmentId={item.attachmentId} page={looking} title={m['sort.page']({ n: looking })} className="h-[56dvh] max-w-[640px] self-start" />
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant={starts[looking] ? 'secondary' : 'default'} disabled={looking === first} onClick={() => toggle(looking, !starts[looking])}>
                  {starts[looking] && looking !== first ? m['sort.not_a_start']() : m['sort.starts_here']()}
                </Button>
                <span className="text-[13px] text-muted-foreground">{m['sort.kept']()}</span>
              </div>
            </div>

            <aside className="flex min-w-0 flex-[0_0_380px] flex-col gap-3.5 overflow-y-auto border-l border-border px-5 py-6">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m['sort.papers_in']({ count: papers.length })}</h2>
              <div className="flex flex-col gap-0.5">
                {papers.map((p) => {
                  const on = p.from === current
                  return (
                    <div key={p.from} className={cn('flex flex-col gap-2 rounded-xl px-3 py-2.5', on && 'bg-secondary')}>
                      <button type="button" onClick={() => setLooking(p.from)} className="flex cursor-pointer items-center gap-2.5 text-left">
                        <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">{range(p.from, p.to)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.title.trim() || kindLabel(p.kind)}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{kindLabel(p.kind)}</span>
                      </button>
                      {on && (
                        <div className="flex flex-col gap-2">
                          <KindSelect value={p.kind} onChange={(kind) => change(p.from, { kind })} />
                          <Input value={p.title} onChange={(e) => change(p.from, { title: e.target.value })} placeholder={m['index.title_placeholder']()} aria-label={m['index.title']()} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {split.isError && <p className="not-typeset text-destructive">{split.error instanceof Error ? split.error.message : m['common.request_failed']()}</p>}
              <p className="text-xs leading-snug text-muted-foreground">{m['sort.offline_note']()}</p>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
