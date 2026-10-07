import * as m from '@/paraglide/messages'
import { ArrowExpand01Icon, ArrowShrink02Icon, Cancel01Icon, LinkSquare02Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@pleadli/ui/dialog'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'

/** What kind of preview a file gets, from its type or, failing that, its name. */
export type PreviewKind = 'image' | 'pdf' | 'markdown' | 'text' | 'none'
export function previewKind(name: string, mime?: string | null): PreviewKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime === 'text/markdown' || ['md', 'markdown'].includes(ext)) return 'markdown'
  if (mime?.startsWith('text/') || ['txt', 'csv', 'log', 'json'].includes(ext)) return 'text'
  return 'none'
}

function decodeText(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Bold, italic, code and links inside one line. Links call `onLink` with
 * their target, so a note that points at another note opens it here. */
function inline(text: string, onLink?: (href: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = i++
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)!
      out.push(
        <a
          key={key}
          href={href}
          onClick={(event) => {
            event.preventDefault()
            onLink?.(href)
          }}
        >
          {label}
        </a>,
      )
    } else out.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Markdown drawn as a document: headings, paragraphs, lists, quotes, code
 * and tables. Built as React elements, never as raw HTML, so nothing in a
 * file can run in the app. */
export function Markdown({ source, onLink }: { source: string; onLink?: (href: string) => void }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = blocks.length
    if (!line.trim()) {
      i++
    } else if (line.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++
      blocks.push(<pre key={key}>{body.join('\n')}</pre>)
    } else if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length
      const Tag = `h${Math.min(level, 4)}` as 'h1'
      blocks.push(<Tag key={key}>{inline(line.replace(/^#+\s*/, ''), onLink)}</Tag>)
      i++
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={key}>
          {items.map((item, n) => (
            <li key={n}>{inline(item, onLink)}</li>
          ))}
        </List>,
      )
    } else if (line.startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key}>{inline(body.join(' '), onLink)}</blockquote>)
    } else if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
      }
      const [head, ...body] = rows
      blocks.push(
        <table key={key}>
          <thead>
            <tr>{head?.map((c, n) => <th key={n}>{inline(c, onLink)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((c, n) => (
                  <td key={n}>{inline(c, onLink)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key} />)
      i++
    } else {
      const body: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s|\|)/.test(lines[i])) body.push(lines[i++])
      blocks.push(<p key={key}>{inline(body.join(' '), onLink)}</p>)
    }
  }
  return <>{blocks.map((block, n) => <Fragment key={n}>{block}</Fragment>)}</>
}

/** One file shown inside the app: a photo as a photo, a PDF as pages, a note
 * as a sheet of paper. Anything else says plainly that it opens in its own
 * program. `load` returns the file as a `data:` URL. */
export function FileView({ name, mime, queryKey, load, onLink, className }: { name: string; mime?: string | null; queryKey: readonly unknown[]; load: () => Promise<string | null>; onLink?: (href: string) => void; className?: string }) {
  const kind = previewKind(name, mime)
  const { data: url, isLoading, isError } = useQuery({ queryKey: ['file-view', ...queryKey], queryFn: load, enabled: kind !== 'none', staleTime: 60_000 })
  if (kind === 'none') return <p className="m-auto max-w-sm text-center text-muted-foreground">{m["viewer.no_preview"]()}</p>
  if (isLoading) return <div className={cn('animate-pulse rounded-xl bg-secondary', className)} />
  if (isError || !url) return <p className="m-auto text-muted-foreground">{m["viewer.cannot_show"]()}</p>
  if (kind === 'image') return <img src={url} alt={name} className={cn('mx-auto rounded-xl object-contain', className)} />
  if (kind === 'pdf') return <iframe title={name} src={`${url}#view=FitH`} className={cn('w-full rounded-xl bg-white ring-1 ring-border/60', className)} />
  const text = decodeText(url)
  return (
    <div className={cn('overflow-y-auto rounded-xl bg-foreground/[0.03] p-4', className)}>
      <div className="paper mx-auto max-w-[210mm] px-[18mm] py-[16mm] print:p-0" style={{ minHeight: 0 }}>
        {kind === 'markdown' ? <Markdown source={text} onLink={onLink} /> : <pre className="whitespace-pre-wrap">{text}</pre>}
      </div>
    </div>
  )
}

/** The viewer as a window over the app: large, full screen on demand,
 * closed with Escape. Print sends what is shown to the printer (or to a PDF);
 * opening in another program is there, but never the default. */
export function FileViewer({
  open,
  onOpenChange,
  title,
  detail,
  children,
  onOpenOutside,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  detail?: ReactNode
  children: ReactNode
  onOpenOutside?: () => void
}) {
  const [full, setFull] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-print-viewer
        showCloseButton={false}
        className={cn('flex flex-col gap-3 p-3 transition-all print:static print:h-auto print:w-auto print:max-w-none print:p-0 print:shadow-none print:ring-0', full ? 'h-dvh max-h-dvh w-screen max-w-none rounded-none sm:max-w-none' : 'h-[88dvh] w-[92vw] max-w-5xl sm:max-w-5xl')}
      >
        <div className="flex items-center justify-between gap-2 px-1 print:hidden">
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="truncate text-base">{title}</DialogTitle>
            {detail && <span className="truncate text-[0.8125rem] text-muted-foreground">{detail}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={() => window.print()}>
              <HugeiconsIcon icon={PrinterIcon} />
              {m["common.print"]()}
            </Button>
            {onOpenOutside && (
              <Button size="icon-sm" variant="ghost" onClick={onOpenOutside} aria-label={m["viewer.open_outside"]()} title={m["viewer.open_outside"]()}>
                <HugeiconsIcon icon={LinkSquare02Icon} />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={() => setFull((f) => !f)} aria-label={full ? m["viewer.exit_full"]() : m["viewer.full"]()} title={full ? m["viewer.exit_full"]() : m["viewer.full"]()}>
              <HugeiconsIcon icon={full ? ArrowShrink02Icon : ArrowExpand01Icon} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => onOpenChange(false)} aria-label={m["viewer.close"]()} title={m["viewer.close"]()}>
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
