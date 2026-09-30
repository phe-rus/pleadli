import { Link } from '@tanstack/react-router'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { isToday, isTomorrow, startOfDay, addDays } from 'date-fns'
import { useMemo } from 'react'
import { VisitActions } from './visit-actions'
import { isSpecialType, visitListItemFullName, visitTypeLabel, type VisitListItem } from './schema'
import { m } from '@/paraglide/messages'

const COLUMNS = [
  { key: 'expected', get title() { return m.visits_expected() }, get hint() { return m.visits_requested_or_scheduled_for_today() }, statuses: ['requested', 'scheduled'] },
  { key: 'gate', get title() { return m.visits_at_the_gate() }, get hint() { return m.visits_checked_in_not_yet_started() }, statuses: ['checked_in'] },
  { key: 'progress', get title() { return m.visits_in_progress() }, get hint() { return m.visits_visit_under_way() }, statuses: ['in_progress'] },
  { key: 'done', get title() { return m.visits_completed_2() }, get hint() { return m.visits_finished_today() }, statuses: ['completed'] },
] as const

function VisitCard({ visit }: { visit: VisitListItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{visit.visitorName}</p>
          <Link to="/prisoners/$prisonerId" params={{ prisonerId: visit.prisonerId }} className="truncate text-muted-foreground underline-offset-4 hover:underline">
            {m.visits_to_see({ visit: visitListItemFullName(visit) })}</Link>
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground">{isToday(visit.visitedAt) ? format(visit.visitedAt, 'HH:mm') : format(visit.visitedAt, 'd MMM HH:mm')}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{visitTypeLabel(visit.visitType)}</Badge>
        {visit.privileged && <Badge variant="secondary">{m.visits_privileged()}</Badge>}
        {visit.partySize > 1 && <Badge variant="secondary">{m.visits_visitors({ partySize: visit.partySize })}</Badge>}
        {visit.status === 'requested' && <Badge variant="destructive">{isSpecialType(visit.visitType) ? m.visits_needs_authorization() : m.visits_needs_approval()}</Badge>}
      </div>
      <VisitActions visit={visit} />
    </div>
  )
}

/** Today at a glance: who is expected, at the gate, in with a prisoner, and
 * done, each with its next step one click away. */
export function TodayBoard({ visits }: { visits: VisitListItem[] }) {
  const today = useMemo(() => visits.filter((v) => isToday(v.visitedAt)).sort((a, b) => a.visitedAt - b.visitedAt), [visits])
  const stale = useMemo(() => {
    const start = startOfDay(new Date()).getTime()
    return visits.filter((v) => v.visitedAt < start && ['requested', 'scheduled', 'checked_in', 'in_progress'].includes(v.status)).sort((a, b) => a.visitedAt - b.visitedAt)
  }, [visits])
  const closed = today.filter((v) => ['denied', 'no_show', 'cancelled'].includes(v.status)).length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{m.visits_today()}</h2>
        <span className="text-xs text-muted-foreground">
          {today.length === 1 ? m.visits_visit_one() : m.visits_visit({ length: today.length })} · {format(new Date(), 'EEEE d MMMM')}
          {closed > 0 && m.visits_refused_cancelled_or_no_show({ closed })}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {COLUMNS.map((column) => {
          const rows = today.filter((v) => (column.statuses as readonly string[]).includes(v.status))
          return (
            <Card key={column.key} className="min-w-64 flex-1 basis-64 p-0">
              <CardContent className="flex flex-col gap-2.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{column.title}</span>
                    <span className="text-[11px] text-muted-foreground">{column.hint}</span>
                  </div>
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', rows.length ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    {rows.length}
                  </span>
                </div>
                {rows.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">{m.visits_nothing_here()}</p> : rows.map((visit) => <VisitCard key={visit.id} visit={visit} />)}
              </CardContent>
            </Card>
          )
        })}
        {stale.length > 0 && (
          <Card className="min-w-64 flex-1 basis-64 border-amber-500/40 p-0">
            <CardContent className="flex flex-col gap-2.5 p-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium">{m.visits_left_open_from_earlier_days()}</span>
                <span className="text-[11px] text-muted-foreground">{m.visits_close_each_one_complete_it_mark()}</span>
              </div>
              {stale.map((visit) => (
                <VisitCard key={visit.id} visit={visit} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}

function dayLabel(ms: number) {
  if (isTomorrow(ms)) return m.visits_tomorrow()
  return format(ms, 'EEEE d MMMM')
}

/** The next two weeks of requested and scheduled visits, day by day. */
export function UpcomingVisits({ visits }: { visits: VisitListItem[] }) {
  const groups = useMemo(() => {
    const from = startOfDay(addDays(new Date(), 1)).getTime()
    const to = startOfDay(addDays(new Date(), 15)).getTime()
    const rows = visits
      .filter((v) => v.visitedAt >= from && v.visitedAt < to && ['requested', 'scheduled'].includes(v.status))
      .sort((a, b) => a.visitedAt - b.visitedAt)
    const byDay = new Map<number, VisitListItem[]>()
    for (const row of rows) {
      const key = startOfDay(row.visitedAt).getTime()
      byDay.set(key, [...(byDay.get(key) ?? []), row])
    }
    return [...byDay.entries()]
  }, [visits])

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{m.visits_coming_up()}</h2>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">{m.visits_no_visits_are_booked_for_the()}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {groups.map(([day, rows]) => (
            <Card key={day} className="min-w-64 flex-1 basis-64 p-0">
              <CardContent className="flex flex-col gap-2 p-3">
                <span className="text-xs font-medium">{dayLabel(day)}</span>
                {rows.map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{visit.visitorName}</p>
                      <p className="truncate text-muted-foreground">{visitListItemFullName(visit)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {visit.status === 'requested' && <Badge variant="secondary">{m.visits_requested()}</Badge>}
                      <span className="tabular-nums text-muted-foreground">{format(visit.visitedAt, 'HH:mm')}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
