import { cn } from '@pleadli/ui/lib/utils'
import { useMemo, useState, type ReactNode } from 'react'

export type PostboxBox = 'inbox' | 'outbox' | 'sent'

export type PostboxLabels = {
  title: string
  /** One calm sentence: what the postbox is for. */
  intro: string
  outbox: { label: string; empty: string }
  inbox: { label: string; empty: string }
  sent?: { label: string; empty: string }
  /** Shown under the mailboxes until the relay is switched on for this office. */
  status: string
  search?: string
  select?: string
  from?: string
  to?: string
  attachments?: string
}

export type PostboxMessage = {
  id: string
  box: PostboxBox
  unread?: boolean
  /** The office or station on the other side. */
  party: string
  at: number
  subject: string
  /** One or two grey lines under the subject in the list. */
  preview: string
  body: ReactNode
  attachments?: { name: string; size?: string }[]
  /** A small state beside the date: Delivered, Waiting, Opened. */
  state?: string
}

const day = (at: number) => {
  const d = new Date(at)
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  return same ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/**
 * The postbox, laid out like a mail program: mailboxes on the left, the
 * messages of one mailbox in the middle, the open message on the right. On a
 * narrow window it is one pane at a time. Props only: no router, no Tauri, no
 * relay code. An app with nothing to show passes no messages.
 */
export function PostboxView({ labels, messages = [], actions, header }: { labels: PostboxLabels; messages?: PostboxMessage[]; actions?: ReactNode; header?: ReactNode }) {
  const [box, setBox] = useState<PostboxBox>('inbox')
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const boxes: { id: PostboxBox; label: string; empty: string }[] = [
    { id: 'inbox', ...labels.inbox },
    { id: 'outbox', ...labels.outbox },
    ...(labels.sent ? [{ id: 'sent' as const, ...labels.sent }] : []),
  ]
  const unread = (id: PostboxBox) => messages.filter((m) => m.box === id && m.unread).length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return messages
      .filter((m) => m.box === box && (!q || `${m.party} ${m.subject} ${m.preview}`.toLowerCase().includes(q)))
      .sort((a, b) => b.at - a.at)
  }, [messages, box, query])
  const open = shown.find((m) => m.id === openId) ?? null
  const current = boxes.find((b) => b.id === box)

  return (
    <div data-postbox className="flex h-[calc(100dvh-7.5rem)] min-h-[28rem] w-full flex-col bg-background">
      {header}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4">
        <div role="tablist" aria-label={labels.title} className="flex gap-5">
          {boxes.map((b) => {
            const n = unread(b.id)
            const active = box === b.id
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setBox(b.id)
                  setOpenId(null)
                }}
                className={cn('-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 py-3 text-[0.8125rem] outline-none transition-colors focus-visible:text-foreground', active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {b.label}
                {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 text-primary-foreground tabular-nums">{n}</span>}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground lg:block">{labels.status}</p>
          {actions}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(17rem,24rem)_minmax(0,1fr)]">
        <section className={cn('min-h-0 flex-col border-r border-border/60', open ? 'hidden md:flex' : 'flex')}>
          <div className="flex items-center gap-2 border-b border-border/60 p-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.search ?? 'Search'}
              aria-label={labels.search ?? 'Search'}
              className="w-full rounded-lg bg-foreground/5 px-3 py-1.5 text-[0.8125rem] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {shown.length === 0 ? (
            <p className="m-auto max-w-56 p-6 text-center text-muted-foreground">{current?.empty}</p>
          ) : (
            <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-border/50 overflow-y-auto p-0">
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    aria-current={openId === m.id ? 'true' : undefined}
                    className={cn('relative flex w-full cursor-pointer flex-col gap-0.5 py-2.5 pr-3 pl-6 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', openId === m.id ? 'bg-primary text-primary-foreground' : 'hover:bg-foreground/[0.04]')}
                  >
                    {m.unread && <span aria-hidden className={cn('absolute top-4 left-2.5 size-2 rounded-full', openId === m.id ? 'bg-primary-foreground' : 'bg-primary')} />}
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-[0.8125rem]', m.unread ? 'font-semibold' : 'font-medium')}>{m.party}</span>
                      <span className={cn('shrink-0 text-xs', openId === m.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{day(m.at)}</span>
                    </span>
                    <span className="truncate text-[0.8125rem]">{m.subject}</span>
                    <span className={cn('line-clamp-2 text-xs', openId === m.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{m.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cn('min-h-0 flex-col overflow-y-auto', open ? 'flex' : 'hidden md:flex')} aria-live="polite">
          {open ? (
            <div className="flex flex-col gap-4 p-5">
              <button type="button" onClick={() => setOpenId(null)} className="w-fit cursor-pointer text-[0.8125rem] text-primary md:hidden">
                {current?.label}
              </button>
              <header className="flex flex-col gap-1 border-b border-border/60 pb-3">
                <h2 className="tracking-tight">{open.subject}</h2>
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-[0.8125rem] text-muted-foreground">
                  <span>
                    {open.box === 'inbox' ? (labels.from ?? 'From') : (labels.to ?? 'To')} <span className="text-foreground">{open.party}</span>
                  </span>
                  <span>
                    {new Date(open.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {open.state ? ` · ${open.state}` : ''}
                  </span>
                </p>
              </header>
              <div className="text-[0.9375rem] leading-relaxed">{open.body}</div>
              {open.attachments && open.attachments.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">{labels.attachments ?? 'Attachments'}</p>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {open.attachments.map((a) => (
                      <li key={a.name} className="rounded-lg bg-foreground/5 px-3 py-1.5 text-[0.8125rem]">
                        {a.name}
                        {a.size && <span className="text-muted-foreground"> · {a.size}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="m-auto flex max-w-xs flex-col gap-1 p-6 text-center">
              <p>{labels.select ?? ''}</p>
              <p className="text-[0.8125rem] text-muted-foreground">{labels.intro}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
