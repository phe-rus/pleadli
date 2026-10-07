import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { diaryOptions, HearingActions, purposeLabel, useDiary, type DiaryRow } from '@/features/hearings'
import { dayBounds, fromIsoDay, startOfDay, toIsoDay } from '@/lib/day'
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { CalendarViewSwitch } from '@/features/calendar/view-switch'
import { formatTime } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { createFileRoute, Link } from '@tanstack/react-router'
import { addDays } from 'date-fns/addDays'

export const Route = createFileRoute('/_public/diary/')({
  validateSearch: (search: Record<string, unknown>): { day?: string } => (fromIsoDay(search.day) != null ? { day: search.day as string } : {}),
  loaderDeps: ({ search }) => ({ day: search.day ?? toIsoDay(Date.now()) }),
  loader: async ({ context, deps }) => {
    const { from, to } = dayBounds(fromIsoDay(deps.day) ?? Date.now())
    await context.queryClient.query({ ...diaryOptions(from, to), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusTag(row: DiaryRow) {
  if (row.status === 'attended') return <Tag tone="done">{m["today.attended"]()}</Tag>
  if (row.status === 'adjourned') return <Tag tone="waiting">{m["today.adjourned"]()}</Tag>
  if (row.status === 'missed') return <Tag tone="urgent">{m["today.missed"]()}</Tag>
  if (row.at < startOfDay(Date.now())) return <Tag tone="urgent">{m["today.att.not_closed"]()}</Tag>
  return <Tag tone="open">{m["cal.to_attend"]()}</Tag>
}

/** The day's hearings, in the order they fall, each closed in place. It
 * prints as a plain list, with the actions left off. */
function RouteComponent() {
  const { day } = Route.useSearch()
  const at = fromIsoDay(day) ?? startOfDay(Date.now())
  const { from, to } = dayBounds(at)
  const { data: rows } = useDiary(from, to)
  const isToday = toIsoDay(at) === toIsoDay(Date.now())
  const title = new Intl.DateTimeFormat(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kampala' }).format(at)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{m["nav.calendar"]()}</p>
          <h1>{title}</h1>
        </div>
        <div className="page-actions print:hidden">
          <Button size="icon-sm" variant="ghost" aria-label={m["cal.previous_day"]()} title={m["cal.previous_day"]()} nativeButton={false} render={<Link to="/diary" search={{ day: toIsoDay(addDays(at, -1)) }} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button size="sm" variant="secondary" disabled={isToday} nativeButton={false} render={<Link to="/diary" search={{}} />}>
            {m["nav.today"]()}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={m["cal.next_day"]()} title={m["cal.next_day"]()} nativeButton={false} render={<Link to="/diary" search={{ day: toIsoDay(addDays(at, 1)) }} />}>
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={m["cal.print"]()} title={m["cal.print"]()} onClick={() => window.print()} disabled={rows.length === 0}>
            <HugeiconsIcon icon={PrinterIcon} />
          </Button>
        </div>
      </header>

      <div className="flex justify-center print:hidden">
        <CalendarViewSwitch value="day" />
      </div>

      {rows.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Calendar03Icon} />}>{m["cal.day_empty"]()}</EmptyNote>
      ) : (
        <Group title={m["cal.diary_for"]({ date: title })}>
          {rows.map((row) => (
            <GroupRow
              key={row.id}
              icon={<span className="text-[0.8125rem] font-medium tabular-nums text-foreground">{formatTime(row.at)}</span>}
              label={
                <Link to="/matters/$matterId" params={{ matterId: row.matterId }} className="text-foreground no-underline hover:underline">
                  {row.courtNumber ? `${row.courtNumber}, ${row.matterTitle}` : row.matterTitle}
                </Link>
              }
              detail={[purposeLabel(row.purpose), [row.courtName, row.courtroom].filter(Boolean).join(', '), `${row.clientName}${row.clientCustody === 'remanded' ? `, ${m["today.on_remand"]()}` : ''}`].filter(Boolean).join(' · ')}
              value={
                <>
                  {statusTag(row)}
                  {row.status === 'scheduled' && (
                    <span className="print:hidden">
                      <HearingActions hearing={row} matterId={row.matterId} />
                    </span>
                  )}
                </>
              }
            />
          ))}
        </Group>
      )}
    </article>
  )
}
