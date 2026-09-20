import {
  Alert02Icon,
  Archive01Icon,
  Message01Icon,
  NetworkIcon,
  Notification01Icon,
  PrisonIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Fragment, useState } from 'react'
import { useInbox } from './queries'
import { RecordCommunication } from './record-communication'
import { inboxFilters, isOpen, kindLabel, matchesFilter, type InboxFilter, type InboxItem } from './schema'
import { shortTime } from './time'
import { m } from '@/paraglide/messages'

/** One small colour per filter, so the chips read at a glance: the dot names
 * the kind, and the tint fills in only on the one that is chosen. */
const filterTone: Record<InboxFilter, { dot: string; on: string }> = {
  all: { dot: 'bg-foreground/40', on: 'bg-foreground/10 text-foreground' },
  unread: { dot: 'bg-primary', on: 'bg-primary/15 text-primary' },
  open: { dot: 'bg-amber-500', on: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  court: { dot: 'bg-violet-500', on: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  head_office: { dot: 'bg-emerald-500', on: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  local: { dot: 'bg-sky-500', on: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
}

const kindIcon: Record<string, typeof Message01Icon> = {
  obligation: Alert02Icon,
  backup: Archive01Icon,
  connection: NetworkIcon,
  communication: Message01Icon,
  facility_request: PrisonIcon,
}

/** One message in the list: what kind of thing it is, the subject, where it
 * came from and the first of what it says, and how long ago. Bold with a dot
 * while it is unread and still needs someone. */
function MessageRow({ item, selected, onSelect }: { item: InboxItem; selected: boolean; onSelect: () => void }) {
  const unread = !item.read && isOpen(item)
  const closed = !isOpen(item)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'relative grid w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3 py-2.5 text-left outline-none transition-colors',
          'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none',
          selected && 'bg-secondary',
        )}
      >
        {selected && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
        <span
          className={cn('flex size-8 items-center justify-center rounded-full', unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}
          aria-hidden
        >
          <HugeiconsIcon icon={kindIcon[item.kind] ?? Notification01Icon} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className={cn('truncate text-sm leading-snug', unread ? 'font-semibold text-foreground' : closed ? 'text-muted-foreground' : 'font-medium text-foreground/90')}>{item.subject}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.source} · {kindLabel[item.kind] ?? item.kind}
          </span>
          {item.body && <span className="truncate text-xs text-muted-foreground/80">{item.body}</span>}
        </span>
        <span className="flex flex-col items-end gap-1.5 pt-0.5">
          <time className={cn('text-xs tabular-nums', unread ? 'font-medium text-primary' : 'text-muted-foreground')} dateTime={new Date(item.createdAt).toISOString()}>
            {shortTime(item.createdAt)}
          </time>
          {unread && <span className="size-2 rounded-full bg-primary" aria-label={m.notifications_unread()} />}
        </span>
      </button>
    </li>
  )
}

/** The inbox as a list of messages, for the sidebar: filters on top, then what
 * still needs someone, then what is closed. Choosing one shows it in the
 * content view; nothing here opens a popup. */
export function InboxList({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string) => void }) {
  const { data: items = [], isPending } = useInbox()
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [recording, setRecording] = useState(false)
  const shown = items.filter((item) => matchesFilter(item, filter))
  const firstClosed = shown.findIndex((item) => !isOpen(item))
  const hasOpen = shown.some(isOpen)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1 px-3 pt-1 pb-2" role="group" aria-label={m.notifications_filter_the_inbox()}>
        {inboxFilters.map((option) => {
          const tone = filterTone[option.id]
          const active = filter === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.id)}
              className={cn(
                'inline-flex h-5 cursor-pointer items-center gap-1 rounded-full px-1.5 text-[0.625rem] leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                active ? cn('font-medium', tone.on) : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span aria-hidden className={cn('size-1.5 rounded-full', tone.dot)} />
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="px-3 pb-2">
        <Button size="xs" variant="secondary" className="w-full" onClick={() => setRecording(true)}>
          {m.notifications_record_a_communication()}
        </Button>
      </div>
      <ul className="not-typeset no-scrollbar m-0 min-h-0 flex-1 list-none divide-y divide-border/30 overflow-y-auto border-t border-border/30 p-0">
        {isPending ? (
          <li className="p-3 text-xs text-muted-foreground">{m.notifications_loading()}</li>
        ) : shown.length === 0 ? (
          <li className="p-4 text-xs text-muted-foreground">{items.length === 0 ? m.notifications_nothing_here_yet_it_is_quiet() : m.notifications_nothing_matches_this_filter()}</li>
        ) : (
          shown.map((item, index) => (
            <Fragment key={item.id}>
              {index === firstClosed && hasOpen && <li className="bg-muted/30 px-3 py-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">{m.notifications_closed()}</li>}
              <MessageRow item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
            </Fragment>
          ))
        )}
      </ul>
      <RecordCommunication open={recording} onOpenChange={setRecording} onRecorded={onSelect} />
    </div>
  )
}
