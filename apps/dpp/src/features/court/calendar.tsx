import { formatDate } from '@/lib/dates'
import { getLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { CalendarEntry } from './data'
import { hearingKindLabel } from './court-record'
import { useCalendar } from './queries'

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b)

/** Monday-first weeks covering the month. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const dot: Record<CalendarEntry['source'], string> = {
  hearing: 'bg-primary',
  task: 'bg-sky-500',
  threshold_review: 'bg-amber-500',
}

function entryTitle(e: CalendarEntry) {
  if (e.source === 'hearing') return `${hearingKindLabel(e.kind ?? 'other')}, ${e.title}`
  if (e.source === 'threshold_review') return m["calendar.threshold_review"]()
  return e.title
}

function Agenda({ entries, day }: { entries: CalendarEntry[]; day: Date }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{formatDate(day, 'weekday')}</h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">{m["calendar.nothing"]()}</p>
      ) : (
        <ol className="flex list-none flex-col gap-2 p-0">
          {entries.map((e) => (
            <li key={`${e.source}:${e.id}`} className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-border/60">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot[e.source])} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="truncate">{entryTitle(e)}</strong>
                  {e.source === 'hearing' && <span className="text-muted-foreground">{formatDate(e.at, 'time')}</span>}
                </div>
                {e.fileId && (
                  <Link to="/files/$fileId" params={{ fileId: e.fileId }} search={{ tab: e.source === 'hearing' ? 'court' : 'file' }} className="truncate text-muted-foreground no-underline hover:text-foreground">
                    {e.fileTitle}
                    {e.fileReference ? `, ${e.fileReference}` : ''}
                  </Link>
                )}
                {e.detail && <p className="text-muted-foreground">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Hearings, task due dates and Threshold Test reviews on one month. Pick a
 * day to see it in full. */
export function Calendar() {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const days = useMemo(() => monthGrid(month), [month])
  const from = days[0].getTime()
  const to = days[41].getTime() + 86_400_000
  const { data: entries = [] } = useCalendar(from, to)

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const e of entries) {
      const k = dayKey(new Date(e.at))
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
  }, [entries])

  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)))
  }, [])

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const upcoming = entries.filter((e) => e.at >= today.setHours(0, 0, 0, 0)).slice(0, 6)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="capitalize">{formatDate(month, 'month')}</h2>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label={m["calendar.previous"]()}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const now = new Date()
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                setSelected(now)
              }}
            >
              {m["calendar.today"]()}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label={m["calendar.next"]()}>
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl ring-1 ring-border/60">
          {weekdays.map((w) => (
            <div key={w} className="border-b border-border/60 bg-secondary/40 py-1.5 text-center text-xs text-muted-foreground capitalize">
              {w}
            </div>
          ))}
          {days.map((d, i) => {
            const inMonth = d.getMonth() === month.getMonth()
            const list = byDay.get(dayKey(d)) ?? []
            const isToday = sameDay(d, new Date())
            const isSelected = sameDay(d, selected)
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(d)}
                className={cn(
                  'flex min-h-20 cursor-pointer flex-col gap-1 border-border/60 p-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                  i % 7 !== 6 && 'border-r',
                  i < 35 && 'border-b',
                  !inMonth && 'bg-secondary/20 text-muted-foreground/60',
                  isSelected && 'bg-primary/5',
                  'hover:bg-secondary/40',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                    isToday && 'bg-primary text-primary-foreground',
                    isSelected && !isToday && 'ring-1 ring-primary',
                  )}
                >
                  {d.getDate()}
                </span>
                {list.slice(0, 2).map((e) => (
                  <span key={`${e.source}:${e.id}`} className="flex items-center gap-1 truncate text-[0.6875rem] leading-4">
                    <span className={cn('size-1.5 shrink-0 rounded-full', dot[e.source])} />
                    <span className="truncate">{entryTitle(e)}</span>
                  </span>
                ))}
                {list.length > 2 && <span className="text-[0.6875rem] text-muted-foreground">{m["calendar.more"]({ count: list.length - 2 })}</span>}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', dot.hearing)} />
            {m["calendar.legend.hearing"]()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', dot.task)} />
            {m["calendar.legend.task"]()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', dot.threshold_review)} />
            {m["calendar.legend.review"]()}
          </span>
        </div>
      </section>
      <aside className="flex flex-col gap-6">
        <Agenda entries={byDay.get(dayKey(selected)) ?? []} day={selected} />
        {upcoming.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground">{m["calendar.coming_up"]()}</h3>
            <ol className="flex list-none flex-col gap-1 p-0">
              {upcoming.map((e) => (
                <li key={`${e.source}:${e.id}`}>
                  <button type="button" onClick={() => setSelected(new Date(e.at))} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-secondary/60">
                    <span className={cn('size-1.5 shrink-0 rounded-full', dot[e.source])} />
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(e.at)}</span>
                    <span className="truncate">{entryTitle(e)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  )
}
