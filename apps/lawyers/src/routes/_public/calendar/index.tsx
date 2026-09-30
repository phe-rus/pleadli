import { clockLabel, usePracticeClocks } from '@/features/clocks'
import { diaryOptions } from '@/features/hearings'
import { tasksOptions } from '@/features/tasks'
import { formatMonth, formatTime } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

const DAY = 86_400_000
const EAT = 3 * 3_600_000

/** A month as `YYYY-MM`; the current one when missing or malformed. */
function parseMonth(value: unknown): { y: number; mo: number } {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (match) return { y: Number(match[1]), mo: Number(match[2]) - 1 }
  const now = new Date(Date.now() + EAT)
  return { y: now.getUTCFullYear(), mo: now.getUTCMonth() }
}
const monthKey = (y: number, mo: number) => `${y}-${String(mo + 1).padStart(2, '0')}`
/** The start of a local (EAT) day as milliseconds. */
const dayStart = (y: number, mo: number, d: number) => Date.UTC(y, mo, d) - EAT
const localDayOf = (ms: number) => Math.floor((ms + EAT) / DAY)

export const Route = createFileRoute('/_public/calendar/')({
  validateSearch: (search: Record<string, unknown>): { month?: string } => (typeof search.month === 'string' ? { month: search.month } : {}),
  component: RouteComponent,
})

type Item = { key: string; kind: 'hearing' | 'deadline' | 'task'; tone: 'urgent' | 'soon' | 'plain' | 'done'; text: string; matterId: string | null }

/** The month: hearings, deadlines and tasks together, each on its day. The
 * diary is still where a hearing is closed; this is for seeing the month. */
function RouteComponent() {
  const { month } = Route.useSearch()
  const navigate = useNavigate()
  const { y, mo } = parseMonth(month)
  const first = dayStart(y, mo, 1)
  const last = dayStart(y, mo + 1, 1)
  // Weeks start on Monday: from the Monday on or before the 1st to the Sunday on or after the last day.
  const lead = (new Date(first + EAT).getUTCDay() + 6) % 7
  const gridStart = first - lead * DAY
  const weeks = Math.ceil((lead + Math.round((last - first) / DAY)) / 7)
  const gridEnd = gridStart + weeks * 7 * DAY

  const { data: hearings } = useQuery(diaryOptions(gridStart, gridEnd))
  const { data: tasks } = useQuery(tasksOptions('open'))
  const { data: clocks } = usePracticeClocks()

  const byDay = useMemo(() => {
    const map = new Map<number, Item[]>()
    const put = (at: number, item: Item) => {
      const k = localDayOf(at)
      map.set(k, [...(map.get(k) ?? []), item])
    }
    for (const h of hearings ?? []) {
      if (h.status === 'cancelled') continue
      put(h.at, { key: `h-${h.id}`, kind: 'hearing', tone: h.status === 'scheduled' ? 'plain' : 'done', text: `${formatTime(h.at)} ${h.courtNumber ?? h.matterTitle}`, matterId: h.matterId })
    }
    for (const c of clocks ?? []) {
      if (c.dueOn < gridStart || c.dueOn >= gridEnd) continue
      put(c.dueOn, { key: `c-${c.matterId}-${c.rule}`, kind: 'deadline', tone: c.status === 'overdue' ? 'urgent' : c.status === 'soon' ? 'soon' : 'plain', text: `${clockLabel(c.rule)} · ${c.courtNumber ?? c.matterTitle}`, matterId: c.matterId })
    }
    for (const task of tasks ?? []) {
      if (!task.dueOn || task.dueOn < gridStart || task.dueOn >= gridEnd) continue
      put(task.dueOn, { key: `t-${task.id}`, kind: 'task', tone: task.dueOn < Date.now() ? 'urgent' : 'plain', text: task.title, matterId: task.matterId })
    }
    return map
  }, [hearings, tasks, clocks, gridStart, gridEnd])

  const today = localDayOf(Date.now())
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 8, 21 + i)))
  const go = (delta: number) => {
    const d = new Date(Date.UTC(y, mo + delta, 1))
    void navigate({ to: '/calendar', search: { month: monthKey(d.getUTCFullYear(), d.getUTCMonth()) }, replace: true })
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{formatMonth(first + DAY)}</h1>
          <p>{m["calendar.lead"]()}</p>
        </div>
        <div className="page-actions">
          <Button size="sm" variant="secondary" aria-label={m["calendar.previous"]()} onClick={() => go(-1)}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void navigate({ to: '/calendar', search: {}, replace: true })}>
            {m["calendar.this_month"]()}
          </Button>
          <Button size="sm" variant="secondary" aria-label={m["calendar.next"]()} onClick={() => go(1)}>
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />{m["calendar.hearing"]()}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-500" />{m["calendar.deadline"]()}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/60" />{m["calendar.task"]()}</span>
      </div>

      <div role="grid" aria-label={formatMonth(first + DAY)} className="grid grid-cols-7 overflow-hidden rounded-xl border border-border">
        {weekdays.map((w) => (
          <div key={w} role="columnheader" className="border-b border-border bg-muted/40 px-2 py-1.5 text-muted-foreground">
            {w}
          </div>
        ))}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const at = gridStart + i * DAY
          const k = localDayOf(at)
          const inMonth = at >= first && at < last
          const items = byDay.get(k) ?? []
          return (
            <div
              key={k}
              role="gridcell"
              aria-label={new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long', timeZone: 'Africa/Kampala' }).format(at + EAT)}
              className={cn('flex min-h-24 flex-col gap-1 border-b border-r border-border/60 p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-muted/20 text-muted-foreground/60')}
            >
              <span className={cn('self-start rounded-full px-1.5 tabular-nums', k === today && 'bg-primary text-primary-foreground')}>{new Date(at + EAT).getUTCDate()}</span>
              {items.slice(0, 4).map((item) => {
                const body = (
                  <span
                    className={cn(
                      'block truncate rounded px-1.5 py-0.5 text-xs',
                      item.kind === 'hearing' && 'bg-primary/10 text-foreground',
                      item.kind === 'deadline' && (item.tone === 'urgent' ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-900 dark:text-amber-200'),
                      item.kind === 'task' && (item.tone === 'urgent' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'),
                      item.tone === 'done' && 'opacity-60',
                    )}
                    title={item.text}
                  >
                    {item.text}
                  </span>
                )
                return item.matterId ? (
                  <Link key={item.key} to="/matters/$matterId" params={{ matterId: item.matterId }} className="no-underline">
                    {body}
                  </Link>
                ) : (
                  <span key={item.key}>{body}</span>
                )
              })}
              {items.length > 4 && <span className="px-1.5 text-xs text-muted-foreground">{m["calendar.more"]({ count: items.length - 4 })}</span>}
            </div>
          )
        })}
      </div>
    </article>
  )
}
