import { PanelButton } from '@/components/add-panel'
import { AlertBanner } from '@/components/alert-banner'
import { Sparkline } from '@/components/charts/sparkline'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { CaseForm } from '@/features/cases'
import { overviewOptions, useOverview, type Attention } from '@/features/overview'
import { purposeLabel, reasonLabel, SittingActions } from '@/features/sittings'
import { plural } from '@/lib/present'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { weeklyBuckets } from '@/lib/weekly-buckets'
import { AlarmClockIcon, CalendarCheckOut01Icon, FolderViewIcon, GavelIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardContent } from '@pleadli/ui/card'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...overviewOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

const openLink = 'text-primary'

function describe(item: Attention, now: number) {
  const at = item.at
  switch (item.kind) {
    case 'not_closed':
      return { tone: 'urgent' as const, tag: 'Not closed', text: `The sitting of ${at ? format(at, 'PP') : 'an earlier date'} was never closed. Record that it was held, adjourned or cancelled.` }
    case 'no_next_date':
      return { tone: 'open' as const, tag: 'No next date', text: `No sitting is fixed.${at ? ` The last was on ${format(at, 'PP')}.` : ''}` }
    case 'remand_ending':
      return at && at < now
        ? { tone: 'urgent' as const, tag: 'Remand ended', text: `${item.person}'s remand ran to ${format(at, 'PP')}.` }
        : { tone: 'open' as const, tag: 'Remand ending', text: `${item.person}'s remand runs to ${at ? format(at, 'PP') : 'a date to be recorded'}.` }
    case 'remand_undated':
      return { tone: 'open' as const, tag: 'No remand date', text: `${item.person} is on remand and no end date is recorded.` }
    case 'record_unsigned':
      return { tone: 'open' as const, tag: 'Record unsigned', text: `The record of the sitting of ${at ? format(at, 'PP') : 'an earlier date'} has notes or appearances and has not been signed.` }
    case 'reserved': {
      const days = at ? differenceInCalendarDays(new Date(now), at) : 0
      return { tone: days > 0 ? ('urgent' as const) : ('open' as const), tag: 'Reserved', text: `${item.person ?? 'A decision'} was reserved on ${at ? format(at, 'PP') : 'a date not recorded'}${at ? `, ${plural(Math.max(days, 0), 'day')} ago` : ''}. It is still a draft.` }
    }
  }
}

/** The bench's home: what is listed today, what has been left open, and how
 * adjournments are running. Every line is read from the record. A section with
 * nothing behind it says so and shows no invented figure. */
function RouteComponent() {
  const { data: today } = useOverview()
  const now = Date.now()
  const { counts, attention, sittings } = today
  const urgent = attention.filter((a) => a.kind === 'not_closed' || (a.kind === 'remand_ending' && a.at != null && a.at < now))
  const buckets = useMemo(() => weeklyBuckets(today.recentAdjournments), [today.recentAdjournments])
  const peak = Math.max(1, ...buckets)
  const lastWeek = buckets[buckets.length - 1] ?? 0
  const previousWeek = buckets[buckets.length - 2] ?? 0
  const trend = previousWeek > 0 ? Math.round(((lastWeek - previousWeek) / previousWeek) * 100) : null

  return (
    <article className="page">
      {urgent.length > 0 && (
        <AlertBanner tone="urgent" title="Left open" action={<Link to="/cause-list" className={openLink}>Cause list</Link>}>
          {plural(urgent.length, 'item')} past a date the record fixes: a sitting not closed, or a remand that has run out.
        </AlertBanner>
      )}
      {counts.unscheduled > 0 && (
        <AlertBanner tone="attention" title="No next date" action={<Link to="/cases" search={{ view: 'unscheduled' }} className={openLink}>Open the list</Link>}>
          {plural(counts.unscheduled, 'open case')} with no sitting fixed.
        </AlertBanner>
      )}

      <header className="page-header">
        <div>
          <h1>Today</h1>
          <p>{format(new Date(), 'EEEE d MMMM yyyy')}. What is listed, and what has been left open.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Register a case" title="Register a case" description="Record a criminal case the court registry has numbered." variant="default">
            {({ close, setDirty }) => <CaseForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Sittings today"
          icon={CalendarCheckOut01Icon}
          tint="primary"
          value={counts.sittingsToday}
          meta={counts.notClosed > 0 && <Badge variant="destructive">{counts.notClosed} not closed</Badge>}
          caption={counts.sittingsToday === 0 ? 'Nothing is listed for today' : 'On the cause list for today'}
        />
        <StatTile label="Open cases" icon={FolderViewIcon} tint="emerald" value={counts.openCases} meta={<Badge variant="secondary">Registered here</Badge>} caption="Criminal cases before this court" />
        <StatTile
          label="No next date"
          icon={AlarmClockIcon}
          tint={counts.unscheduled > 0 ? 'rose' : 'emerald'}
          value={counts.unscheduled}
          meta={<Badge variant={counts.unscheduled > 0 ? 'destructive' : 'secondary'}>{counts.unscheduled > 0 ? 'Action needed' : 'Clear'}</Badge>}
          caption="Open cases with no sitting fixed"
        />
        <StatTile
          label="Draft orders"
          icon={GavelIcon}
          tint="amber"
          value={counts.draftOrders}
          meta={<Badge variant="secondary">Not issued</Badge>}
          caption="Prepared but not yet issued"
        />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="listed" className="page-section">
            <div className="section-head">
              <h2 id="listed">Listed today</h2>
              <Link to="/cause-list" className={openLink}>Cause list</Link>
            </div>
            {sittings.length === 0 ? (
              <EmptyNote>Nothing is listed for today. Schedule a sitting from a case.</EmptyNote>
            ) : (
              <RowList>
                {sittings.map((s) => (
                  <Row
                    key={s.id}
                    marker={s.status === 'scheduled' ? 'open' : undefined}
                    aligned
                    title={
                      <>
                        {format(s.scheduledAt, 'HH:mm')}{' '}
                        <Link to="/cases/$caseId" params={{ caseId: s.caseId }} className="text-foreground">
                          {s.courtNumber}, {s.caseTitle}
                        </Link>
                      </>
                    }
                    summary={`${purposeLabel(s.purpose)}${s.courtroom ? `, ${s.courtroom}` : ''}${s.accused ? `. ${s.accused}` : ''}${s.adjournments > 0 ? `. Adjourned ${s.adjournments === 1 ? 'once' : `${s.adjournments} times`} before` : ''}.`}
                    trailing={
                      <>
                        {s.status !== 'scheduled' && <Tag tone={s.status === 'held' ? 'done' : 'waiting'}>{s.status === 'held' ? 'Held' : 'Adjourned'}</Tag>}
                        <Link to="/sittings/$sittingId" params={{ sittingId: s.id }} className={openLink}>Open</Link>
                        {s.status === 'scheduled' && <SittingActions sitting={s} caseId={s.caseId} />}
                      </>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="attention" className="page-section">
            <div className="section-head">
              <h2 id="attention">Needs attention</h2>
              {attention.length > 0 && <Tag tone="open">{plural(attention.length, 'item')}</Tag>}
            </div>
            {attention.length === 0 ? (
              <EmptyNote>Nothing needs attention. Every sitting is closed and every open case has a next date.</EmptyNote>
            ) : (
              <RowList>
                {attention.map((item, index) => {
                  const d = describe(item, now)
                  return (
                    <Row
                      key={`${item.kind}:${item.caseId}:${item.person ?? ''}:${index}`}
                      marker={d.tone}
                      title={`${item.courtNumber}, ${item.caseTitle}`}
                      summary={d.text}
                      trailing={
                        <>
                          <Tag tone={d.tone}>{d.tag}</Tag>
                          {item.kind === 'record_unsigned' && item.refId ? (
                            <Link to="/sittings/$sittingId" params={{ sittingId: item.refId }} className={openLink}>Open sitting</Link>
                          ) : item.kind === 'reserved' && item.refId ? (
                            <Link to="/rulings/$rulingId" params={{ rulingId: item.refId }} className={openLink}>Open decision</Link>
                          ) : (
                            <Link to="/cases/$caseId" params={{ caseId: item.caseId }} className={openLink}>Open</Link>
                          )}
                        </>
                      }
                    />
                  )
                })}
              </RowList>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="trend" className="page-section">
            <h2 id="trend">Adjournments, last 8 weeks</h2>
            <Card className="p-0">
              <CardContent className="p-0">
                <div className="flex justify-between p-5">
                  <p className="tabular-nums">{plural(today.recentAdjournments.length, 'adjournment')}</p>
                  <p className="tabular-nums">
                    Peak: {peak}/wk
                    {trend !== null && ` · ${trend >= 0 ? '+' : ''}${trend}% on the week before`}
                  </p>
                </div>
                <Sparkline data={buckets} />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="reasons" className="page-section">
            <h2 id="reasons">Why sittings were adjourned</h2>
            {today.reasonCounts.length === 0 ? (
              <EmptyNote>No sitting has been adjourned in this period.</EmptyNote>
            ) : (
              <RowList>
                {today.reasonCounts.map((r) => (
                  <Row key={r.reason} aligned title={reasonLabel(r.reason)} trailing={<Tag tone="neutral">{r.count}</Tag>} />
                ))}
              </RowList>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
