import { formatDate } from '@/lib/dates'
import { packText } from '@/lib/jurisdiction'
import { openAttachment } from '@/features/attachments'
import { DocumentView } from '@/components/document-viewer'
import { useJurisdiction } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { Add01Icon, ArrowExpand01Icon, ArrowShrink02Icon, Delete02Icon, File02Icon, SparklesIcon, TextIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DOC_KINDS, sectionFor, type Country, type FileSection } from '@pleadli/setup'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { useState } from 'react'
import type { FileItem } from './data'
import { ImportPaper } from './import-paper'
import { useConfirmFileItems, useCreateFileItem, useDeleteFileItem, useFileItems, useUpdateFileItem } from './queries'

export const kindLabel = (kind: string) => {
  const found = DOC_KINDS.find((k) => k.id === kind)
  return found ? packText(found.label) : kind
}

const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
const pages = (i: FileItem) => (i.pageFrom && i.pageTo ? i.pageTo - i.pageFrom + 1 : 1)

export type Group = { key: string; code: string | null; title: string; items: FileItem[] }

/** The file's sections in the country's order; a country without a known
 * order groups by kind of document. Items keep their own order within. */
export function groups(country: Country | undefined, items: FileItem[]): Group[] {
  const sections = country?.fileSections?.sections
  if (sections) {
    const placed = new Set<string>()
    const out: Group[] = sections.map((s: FileSection) => {
      const inside = items.filter((i) => (s.kinds as readonly string[]).includes(i.kind))
      inside.forEach((i) => placed.add(i.id))
      return { key: s.code, code: s.code, title: packText(s.title), items: inside }
    })
    const rest = items.filter((i) => !placed.has(i.id))
    if (rest.length) out.push({ key: 'rest', code: null, title: m["index.unsorted"](), items: rest })
    return out
  }
  return DOC_KINDS.map((k) => ({ key: k.id, code: null, title: packText(k.label), items: items.filter((i) => i.kind === k.id) })).filter((g) => g.items.length > 0)
}

export function KindSelect({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  const country = useJurisdiction()
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {DOC_KINDS.map((k) => {
        const section = sectionFor(country, k.id)
        return (
          <option key={k.id} value={k.id}>
            {section ? `${section.code}. ` : ''}
            {packText(k.label)}
          </option>
        )
      })}
    </select>
  )
}

/** Record a document straight into the file, with no paper behind it: a
 * statement taken down, a minute, a note of a call. */
export function TypedEntry({ fileId, onDone }: { fileId: string; onDone: () => void }) {
  const [kind, setKind] = useState('witness_statement')
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [body, setBody] = useState('')
  const create = useCreateFileItem(fileId)
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        create.mutate(
          { prosecutionFileId: fileId, kind, title: title.trim(), documentDate: day ? new Date(`${day}T12:00:00`).getTime() : null, body: body.trim() || null },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["index.title"]()}</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={m["index.title_placeholder"]()} autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["index.date"]()}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{m["index.kind"]()}</span>
        <KindSelect value={kind} onChange={setKind} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{m["index.text"]()}</span>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" placeholder={m["index.text_placeholder"]()} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
          {m["index.add_to_file"]()}
        </Button>
      </div>
    </form>
  )
}

function Reader({ item, fileId, onClose }: { item: FileItem; fileId: string; onClose: () => void }) {
  const update = useUpdateFileItem(fileId)
  const remove = useDeleteFileItem(fileId)
  const [title, setTitle] = useState(item.title)
  const [showText, setShowText] = useState(!item.attachmentId)
  const [full, setFull] = useState(false)
  const unconfirmed = item.source === 'assist' && !item.confirmedAt

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'flex flex-col gap-4 overflow-y-auto transition-all',
          full ? 'h-dvh max-h-dvh w-screen max-w-none rounded-none sm:max-w-none' : 'max-h-[92dvh] w-[92vw] sm:max-w-4xl',
        )}
      >
        <DialogHeader>
          <DialogTitle>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== item.title && update.mutate({ id: item.id, change: { title: title.trim(), confirm: true } })}
              className="w-full bg-transparent outline-none"
              aria-label={m["index.title"]()}
            />
          </DialogTitle>
          <DialogDescription>
            {[kindLabel(item.kind), item.documentDate ? formatDate(item.documentDate, 'long') : null, item.pageFrom ? m["index.pages"]({ from: item.pageFrom, to: item.pageTo ?? item.pageFrom }) : null]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {unconfirmed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/20">
            <span className="inline-flex items-center gap-2">
              <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
              {m["index.placed_by_assist"]()}
            </span>
            <Button size="sm" onClick={() => update.mutate({ id: item.id, change: { confirm: true } })}>
              {m["index.confirm"]()}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <KindSelect value={item.kind} onChange={(kind) => update.mutate({ id: item.id, change: { kind, confirm: true } })} />
          {item.attachmentId && item.body && (
            <div className="flex rounded-lg bg-secondary p-0.5">
              <button type="button" onClick={() => setShowText(false)} className={cn('cursor-pointer rounded-md px-3 py-1 text-sm', !showText && 'bg-background shadow-xs')}>
                {m["index.view_scan"]()}
              </button>
              <button type="button" onClick={() => setShowText(true)} className={cn('cursor-pointer rounded-md px-3 py-1 text-sm', showText && 'bg-background shadow-xs')}>
                {m["index.view_text"]()}
              </button>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => setFull((f) => !f)}>
            <HugeiconsIcon icon={full ? ArrowShrink02Icon : ArrowExpand01Icon} />
            {full ? m["viewer.exit_full"]() : m["viewer.full"]()}
          </Button>
          {item.attachmentId && (
            <Button size="sm" variant="ghost" onClick={() => openAttachment({ id: item.attachmentId! })}>
              {m["index.open_scan"]()}
            </Button>
          )}
        </div>

        {item.summary && <p className="rounded-xl bg-secondary/50 p-3">{item.summary}</p>}
        {showText ? (
          <article className="whitespace-pre-wrap rounded-xl p-4 font-serif leading-relaxed ring-1 ring-border/60">{item.body || m["index.no_text"]()}</article>
        ) : (
          item.attachmentId && <DocumentView attachmentId={item.attachmentId} page={item.pageFrom} title={item.title} className={full ? 'h-[calc(100dvh-14rem)]' : 'h-[62dvh]'} />
        )}
        {item.people && (
          <p className="text-muted-foreground">
            {m["index.people_named"]()}: {item.people}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              remove.mutate(item.id)
              onClose()
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            {m["index.remove"]()}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {m["board.close"]()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The file as it sits in its folder: the country's sections in order, each
 * document with its sheet numbers, whether typed straight in or scanned. */
export function FileIndex({ fileId }: { fileId: string }) {
  const country = useJurisdiction()
  const { data: items = [] } = useFileItems(fileId)
  const confirm = useConfirmFileItems(fileId)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = groups(country, items)
  const unconfirmed = items.filter((i) => i.source === 'assist' && !i.confirmedAt).length
  const provisional = country?.fileSections?.status === 'provisional'

  let sheet = 0
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          {items.length === 0 ? m["index.empty"]() : m["index.count"]({ count: items.length, sheets: items.reduce((n, i) => n + pages(i), 0) })}
          {provisional && ` ${m["index.order_provisional"]()}`}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={adding}>
            <HugeiconsIcon icon={TextIcon} />
            {m["index.type_document"]()}
          </Button>
          <ImportPaper fileId={fileId} />
        </div>
      </div>

      {unconfirmed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/20">
          <div className="flex items-start gap-3">
            <HugeiconsIcon icon={SparklesIcon} className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <strong>{m["index.check_title"]({ count: unconfirmed })}</strong>
              <p className="text-muted-foreground">{m["index.check_body"]()}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            {m["index.confirm_all"]()}
          </Button>
        </div>
      )}

      {adding && <TypedEntry fileId={fileId} onDone={() => setAdding(false)} />}

      <ol className="flex list-none flex-col gap-1 p-0">
        {list.map((group) => (
          <li key={group.key} className="flex flex-col">
            <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2', group.items.length === 0 && 'text-muted-foreground')}>
              {group.code && (
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold', group.items.length ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                  {group.code}
                </span>
              )}
              <span className="flex-1 font-medium">{group.title}</span>
              {group.items.length === 0 && <span className="text-xs">{m["index.nothing_yet"]()}</span>}
            </div>
            {group.items.length > 0 && (
              <ul className="ml-5 flex list-none flex-col border-l border-border/60 p-0 pl-4">
                {group.items.map((item) => {
                  const first = sheet + 1
                  sheet += pages(item)
                  const unconfirmedItem = item.source === 'assist' && !item.confirmedAt
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(item.id)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/60"
                      >
                        <HugeiconsIcon icon={item.attachmentId ? File02Icon : TextIcon} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[kindLabel(item.kind), item.documentDate ? formatDate(item.documentDate) : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {unconfirmedItem && <HugeiconsIcon icon={SparklesIcon} className="size-3.5 shrink-0 text-primary" aria-label={m["index.placed_by_assist"]()} />}
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{sheet > first ? m["index.sheets"]({ from: first, to: sheet }) : m["index.sheet"]({ n: first })}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {items.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
          <HugeiconsIcon icon={Add01Icon} className="size-6 text-muted-foreground" />
          <p className="max-w-md text-muted-foreground">{m["index.empty_body"]()}</p>
        </div>
      )}

      {open && items.find((i) => i.id === open) && <Reader item={items.find((i) => i.id === open)!} fileId={fileId} onClose={() => setOpen(null)} />}
    </div>
  )
}
