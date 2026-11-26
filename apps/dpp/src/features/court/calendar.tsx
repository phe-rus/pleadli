import { kindBarColour } from '@/components/file-chips'
import { useClocks } from '@/features/clocks'
import { useFiles } from '@/features/prosecution-files'
import { formatDate } from '@/lib/dates'
import { getLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { useMemo, useState } from 'react'
import type { CalendarEntry } from './data'
import { hearingKindLabel } from './court-record'
import { useCalendar } from './queries'

type View = 'week' | 'month' | 'list' | 'deadlines'

const DAY = 86_400_000
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b)
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))

/** Monday-first weeks covering the month. */
function monthGrid(month: Date) {
  const start = mondayOf(new Date(month.getFullYear(), month.getMonth(), 1))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** The line's own colour comes from the registry cover of its file, so the
 * diary reads like the shelf: pink trial, yellow application, green appeal. */
const tint: Record<string, string> = { application: '#fffbea', appeal: '#f4faf6' }

function entryTitle(e: CalendarEntry) {
  if (e.source === 'hearing') return `${hearingKindLabel(e.kind ?? 'other')}, ${e.title}`
  if (e.source === 'threshold_review') return m['calendar.threshold_review']()
  if (e.source === 'direction') return m['calendar.direction_due']({ what: e.title })
  return e.title
}

function useKindByFile() {
  const { data: files = [] } = useFiles('all')
  return useMemo(() => new Map(files.map((f) => [f.id, f.kind as string])), [files])
}

function EntryCard({ e, kindOf }: { e: CalendarEntry; kindOf: Map<string, string> }) {
  const kind = (e.fileId && kindOf.get(e.fileId)) || 'perusal'
  const time = e.source === 'hearing' ? `${formatDate(e.at, 'time')} ` : ''
  const body = (
    <>
      <b className="text-[13px] font-semibold">
        {time}
        {e.source === 'hearing' ? e.title : entryTitle(e)}
      </b>
      <span className="text-xs leading-snug text-muted-foreground">
        {[e.source === 'hearing' ? hearingKindLabel(e.kind ?? 'other') : null, e.detail].filter(Boolean).join(' · ') || e.fileReference || ''}
      </span>
    </>
  )
  const style = { borderLeftColor: kindBarColour[kind] ?? '#c7c7cc', background: tint[kind] }
  const cls = 'flex flex-col gap-0.5 rounded-xl border-l-4 bg-secondary/60 px-3 py-2.5 text-foreground no-underline'
  return e.fileId ? (
    <Link to="/files/$fileId" params={{ fileId: e.fileId }} search={{ tab: 'case' }} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  )
}

function WeekView({ weekStart, entries, kindOf }: { weekStart: Date; entries: CalendarEntry[]; kindOf: Map<string, string> }) {
  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of entries) byDay.set(dayKey(new Date(e.at)), [...(byDay.get(dayKey(new Date(e.at))) ?? []), e])
  // Weekends only appear when something is on them.
  const span = [5, 6].some((i) => byDay.has(dayKey(addDays(weekStart, i)))) ? 7 : 5
  const days = Array.from({ length: span }, (_, i) => addDays(weekStart, i))
  const head = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', day: 'numeric' })
  const today = new Date()
  return (
    <div className="flex flex-wrap items-start gap-3.5">
      {days.map((d) => {
        const list = (byDay.get(dayKey(d)) ?? []).sort((a, b) => a.at - b.at)
        const isToday = sameDay(d, today)
        return (
          <div key={dayKey(d)} className="flex min-w-[140px] flex-1 basis-[150px] flex-col gap-2">
            <div className={cn('border-b border-border pb-2 text-[13px] font-semibold capitalize', isToday ? 'text-primary' : 'text-muted-foreground')}>
              {head.format(d)}
              {isToday && ` · ${m['calendar.today_marker']()}`}
            </div>
            {list.length === 0 ? <div className="text-xs text-muted-foreground/70">{m['calendar.nothing_short']()}</div> : list.map((e) => <EntryCard key={`${e.source}:${e.id}`} e={e} kindOf={kindOf} />)}
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ month, entries, kindOf }: { month: Date; entries: CalendarEntry[]; kindOf: Map<string, string> }) {
  const days = useMemo(() => monthGrid(month), [month])
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)))
  }, [])
  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of entries) byDay.set(dayKey(new Date(e.at)), [...(byDay.get(dayKey(new Date(e.at))) ?? []), e])
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border/70">
      {weekdays.map((w) => (
        <div key={w} className="border-b border-border/60 py-2 pe-3 text-end text-xs font-medium capitalize text-muted-foreground">
          {w}
        </div>
      ))}
      {days.map((d, i) => {
        const list = byDay.get(dayKey(d)) ?? []
        const inMonth = d.getMonth() === month.getMonth()
        return (
          <div key={i} className={cn('flex min-h-22 flex-col gap-1 border-border/50 p-1.5', i % 7 !== 6 && 'border-r', i < 35 && 'border-b', !inMonth && 'text-muted-foreground/45')}>
            <span className={cn('flex size-6 items-center justify-center self-end rounded-full text-[0.8125rem] tabular-nums', sameDay(d, new Date()) && 'bg-red-500 font-semibold text-white')}>{d.getDate()}</span>
            {list.slice(0, 3).map((e) => {
              const kind = (e.fileId && kindOf.get(e.fileId)) || 'perusal'
              const row = (
                <span className="flex items-center gap-1 truncate text-[0.6875rem] leading-4">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: kindBarColour[kind] ?? '#c7c7cc' }} />
                  <span className="truncate">{e.source === 'hearing' ? e.title : entryTitle(e)}</span>
                </span>
              )
              return e.fileId ? (
                <Link key={`${e.source}:${e.id}`} to="/files/$fileId" params={{ fileId: e.fileId }} search={{ tab: 'case' }} className="text-foreground no-underline">
                  {row}
                </Link>
              ) : (
                <div key={`${e.source}:${e.id}`}>{row}</div>
              )
            })}
            {list.length > 3 && <span className="text-[0.6875rem] text-muted-foreground">{m['calendar.more']({ count: list.length - 3 })}</span>}
          </div>
        )
      })}
    </div>
  )
}

function ListView({ entries, kindOf }: { entries: CalendarEntry[]; kindOf: Map<string, string> }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{m['calendar.list_empty']()}</p>
  const sorted = [...entries].sort((a, b) => a.at - b.at)
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((e, i) => (
        <div key={`${e.source}:${e.id}`} className="flex flex-col gap-1.5">
          {(i === 0 || !sameDay(new Date(sorted[i - 1].at), new Date(e.at))) && <div className="pt-2 text-[13px] font-semibold text-muted-foreground">{formatDate(e.at, 'weekday')}</div>}
          <EntryCard e={e} kindOf={kindOf} />
        </div>
      ))}
    </div>
  )
}

/** What runs out on a calendar date but is not a sitting: the office clocks,
 * task due dates and threshold-test reviews, nearest first. */
function Deadlines({ entries }: { entries: CalendarEntry[] }) {
  const { data: clocks = [] } = useClocks()
  const rows = useMemo(() => {
    const now = new Date()
    const what = (k: string) => (k === 'allocation' ? m['today.deadline.allocation']() : k === 'complaint_reply' ? m['today.deadline.reply']() : m['today.deadline.review']())
    const line = (at: number | null, text: string, fileId: string | null, detail: string, tone: string) => ({ at, text, fileId, detail, tone })
    const out = [
      ...clocks.map((c) => {
        const days = c.dueAt == null ? null : differenceInCalendarDays(c.dueAt, now)
        const name = `${what(c.kind)}, ${c.fileTitle}`
        const text = c.kind === 'adjournment_review' ? m['calendar.review_now']({ what: name }) : c.overdue || (days != null && days < 0) ? m['calendar.overdue_what']({ what: name }) : days === 0 ? m['calendar.due_today']({ what: name }) : m['calendar.in_days']({ days: days ?? 0, what: name })
        const detail = c.kind === 'adjournment_review' ? m['today.deadline.adjournments']({ count: c.count ?? 0 }) : c.dueAt ? formatDate(c.dueAt) : ''
        return line(c.kind === 'adjournment_review' ? 0 : c.dueAt, text, c.fileId, detail, c.overdue || c.kind === 'adjournment_review' ? '#f4a259' : '#b8bcc2')
      }),
      ...entries
        .filter((e) => e.source !== 'hearing')
        .map((e) => {
          const days = differenceInCalendarDays(e.at, now)
          const name = entryTitle(e)
          const text = days < 0 ? m['calendar.overdue_what']({ what: name }) : days === 0 ? m['calendar.due_today']({ what: name }) : m['calendar.in_days']({ days, what: name })
          return line(e.at, text, e.fileId, [e.fileTitle, e.detail].filter(Boolean).join(' · '), '#b8bcc2')
        }),
    ]
    return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
  }, [clocks, entries])

  return (
    <section className="flex min-w-0 flex-1 basis-[340px] flex-col gap-2.5 rounded-2xl border border-border p-5">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m['calendar.deadlines_title']()}</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{m['calendar.no_deadlines']()}</p>}
      {rows.map((r, i) => {
        const body = (
          <>
            <b className="text-[13px] font-semibold">{r.text}</b>
            {r.detail && <span className="text-xs leading-snug text-muted-foreground">{r.detail}</span>}
          </>
        )
        const cls = 'flex flex-col gap-0.5 rounded-xl border-l-4 bg-secondary/60 px-3 py-2.5 text-foreground no-underline'
        return r.fileId ? (
          <Link key={i} to="/files/$fileId" params={{ fileId: r.fileId }} className={cls} style={{ borderLeftColor: r.tone }}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls} style={{ borderLeftColor: r.tone }}>
            {body}
          </div>
        )
      })}
    </section>
  )
}

/** The Diary: the week the prosecutor is in, with the dates that are not
 * sittings underneath. Month and List are the same dates, laid out otherwise. */
export function Calendar() {
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const kindOf = useKindByFile()

  const weekStart = mondayOf(anchor)
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const grid = useMemo(() => monthGrid(month), [month.getTime()])
  const today = startOfDay(new Date())
  const from = view === 'week' ? weekStart.getTime() : view === 'month' ? grid[0].getTime() : today.getTime()
  const to = view === 'week' ? weekStart.getTime() + 7 * DAY : view === 'month' ? grid[41].getTime() + DAY : today.getTime() + 60 * DAY
  const { data: entries = [] } = useCalendar(from, to)
  const { data: soon = [] } = useCalendar(today.getTime(), today.getTime() + 30 * DAY)

  const shift = (n: number) => setAnchor(view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : addDays(anchor, 7 * n))
  const { data: clockList = [] } = useClocks()
  const hearings = entries.filter((e) => e.source === 'hearing').length
  const deadlineCount = soon.filter((e) => e.source !== 'hearing').length
  const deadlineTotal = deadlineCount + clockList.length
  const weekLabel = new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long' }).format(weekStart)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[32px] font-semibold tracking-tight">{m['nav.item.calendar']()}</h1>
          <p className="text-[15px] text-muted-foreground">
            {view === 'month' ? formatDate(month, 'month') : m['calendar.subtitle']({ date: weekLabel, hearings, deadlines: deadlineTotal })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(view === 'week' || view === 'month') && (
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label={view === 'month' ? m['calendar.previous']() : m['calendar.previous_week']()}>
                <HugeiconsIcon icon={ArrowLeft01Icon} />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
                {m['calendar.today']()}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label={view === 'month' ? m['calendar.next']() : m['calendar.next_week']()}>
                <HugeiconsIcon icon={ArrowRight01Icon} />
              </Button>
            </div>
          )}
        </div>
      </header>

      <div role="tablist" className="-mt-2 flex flex-wrap items-center gap-1 border-b border-border/40">
        {(['week', 'month', 'list', 'deadlines'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn('relative h-9 cursor-pointer px-3 text-[0.8125rem] outline-none transition-colors', view === v ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {v === 'deadlines' ? m['calendar.deadlines_tab']() : m[`calendar.${v}`]()}
            {v === 'deadlines' && <span className="ms-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{deadlineTotal}</span>}
          </button>
        ))}
      </div>

      {view === 'week' && <WeekView weekStart={weekStart} entries={entries} kindOf={kindOf} />}
      {view === 'month' && <MonthView month={month} entries={entries} kindOf={kindOf} />}
      {view === 'list' && <ListView entries={entries} kindOf={kindOf} />}

      {view === 'deadlines' && (
      <div className="flex flex-wrap items-stretch gap-[18px]">
        <Deadlines entries={soon} />
        <section className="flex min-w-0 flex-1 basis-[280px] flex-col gap-2.5 rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m['calendar.fills_title']()}</h2>
          <p className="text-sm leading-relaxed">{m['calendar.fills_one']()}</p>
          <p className="text-sm leading-relaxed">{m['calendar.fills_two']()}</p>
          <p className="text-xs leading-snug text-muted-foreground">{m['calendar.fills_colours']()}</p>
        </section>
      </div>
      )}
    </div>
  )
}
