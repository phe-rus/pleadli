import { PanelButton } from '@/components/add-panel'
import { AlertBanner } from '@/components/alert-banner'
import { Sparkline } from '@/components/charts/sparkline'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { HearingActions, purposeLabel, reasonLabel, type DiaryRow } from '@/features/hearings'
import { MatterForm } from '@/features/matters'
import { overviewOptions, useOverview, type Attention } from '@/features/overview'
import { plural } from '@/lib/present'
import { weeklyBuckets } from '@/lib/weekly-buckets'
import { AlarmClockIcon, CalendarCheckOut01Icon, FolderViewIcon, LegalDocument01Icon } from '@hugeicons/core-free-icons'
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

function describe(item: Attention) {
  const at = item.at
  switch (item.kind) {
    case 'hearing_not_closed':
      return { tone: 'urgent' as const, tag: 'Not closed', text: `The hearing of ${at ? format(at, 'PP') : 'an earlier date'} was never closed. Record that you attended, or that it was adjourned, missed or cancelled.` }
    case 'no_hearing':
      return { tone: 'open' as const, tag: 'No hearing listed', text: `Nothing is in the diary.${at ? ` The last hearing was on ${format(at, 'PP')}.` : ''}` }
    case 'task_overdue':
      return { tone: 'urgent' as const, tag: 'Overdue', text: `${item.detail ?? 'A task'} was due ${at ? format(at, 'PP') : 'earlier'}.` }
    case 'task_soon':
      return { tone: 'open' as const, tag: 'Due soon', text: `${item.detail ?? 'A task'} is due ${at ? format(at, 'EEE d MMM') : 'soon'}.` }
    case 'plea_unconfirmed':
      return { tone: 'open' as const, tag: 'Plea agreed', text: `An agreement was reached${at ? ` and signed on ${format(at, 'PP')}` : ''} and is not yet confirmed before the court.` }
  }
}

function HearingLine({ row }: { row: DiaryRow }) {
  const remanded = row.clientCustody === 'remanded'
  return (
    <Row
      key={row.id}
      marker={row.status === 'scheduled' ? 'open' : undefined}
      aligned
      title={
        <>
          {format(row.at, 'HH:mm')}{' '}
          <Link to="/matters/$matterId" params={{ matterId: row.matterId }} className="text-foreground">
            {row.courtNumber ? `${row.courtNumber}, ` : ''}
            {row.matterTitle}
          </Link>
        </>
      }
      summary={`${purposeLabel(row.purpose)}${row.courtroom ? `, ${row.courtroom}` : ''}. ${row.clientName}${remanded ? ', on remand' : ''}.`}
      trailing={
        row.status === 'scheduled' ? (
          <HearingActions hearing={row} matterId={row.matterId} />
        ) : (
          <Tag tone={row.status === 'attended' ? 'done' : row.status === 'missed' ? 'urgent' : 'waiting'}>{row.status === 'attended' ? 'Attended' : row.status === 'missed' ? 'Missed' : 'Adjourned'}</Tag>
        )
      }
    />
  )
}

/** The advocate's home: what is in the diary today, what is due, and what has
 * been left open. Every line is read from the record. A section with nothing
 * behind it says so and shows no invented figure. */
function RouteComponent() {
  const { data: today } = useOverview()
  const { counts, attention, hearings, upcoming } = today
  const urgent = attention.filter((a) => a.kind === 'hearing_not_closed' || a.kind === 'task_overdue')
  const buckets = useMemo(() => weeklyBuckets(today.recentAdjournments), [today.recentAdjournments])
  const peak = Math.max(1, ...buckets)

  return (
    <article className="page">
      {urgent.length > 0 && (
        <AlertBanner tone="urgent" title="Left open" action={<Link to="/tasks" className={openLink}>Tasks</Link>}>
          {plural(urgent.length, 'item')} past a day that is fixed: a hearing not closed, or a task overdue.
        </AlertBanner>
      )}
      {counts.noHearing > 0 && (
        <AlertBanner tone="attention" title="No hearing listed" action={<Link to="/matters" search={{ view: 'no_hearing' }} className={openLink}>Open the list</Link>}>
          {plural(counts.noHearing, 'open matter')} with nothing in the diary.
        </AlertBanner>
      )}

      <header className="page-header">
        <div>
          <h1>Today</h1>
          <p>{format(new Date(), 'EEEE d MMMM yyyy')}. What is in your diary, what is due, and what has been left open.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Open a matter" title="Open a matter" description="A client, and the matter you are acting in for them." variant="default">
            {({ close, setDirty }) => <MatterForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Hearings today"
          icon={CalendarCheckOut01Icon}
          tint="primary"
          value={counts.hearingsToday}
          meta={counts.notClosed > 0 && <Badge variant="destructive">{counts.notClosed} not closed</Badge>}
          caption={counts.hearingsToday === 0 ? 'Nothing is in the diary for today' : 'In your diary for today'}
        />
        <StatTile label="Open matters" icon={FolderViewIcon} tint="emerald" value={counts.openMatters} meta={<Badge variant="secondary">{counts.noHearing} with no hearing</Badge>} caption="Matters you are acting in" />
        <StatTile
          label="Tasks"
          icon={AlarmClockIcon}
          tint={counts.tasksOverdue > 0 ? 'rose' : 'amber'}
          value={counts.tasksOpen}
          meta={<Badge variant={counts.tasksOverdue > 0 ? 'destructive' : 'secondary'}>{counts.tasksOverdue > 0 ? `${counts.tasksOverdue} overdue` : 'None overdue'}</Badge>}
          caption="Open tasks, yours and the state-funded scheme's"
        />
        <StatTile label="Drafts" icon={LegalDocument01Icon} tint="amber" value={counts.draftDocuments} meta={<Badge variant="secondary">Not filed</Badge>} caption="Documents drafted and not yet filed" />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="listed" className="page-section">
            <div className="section-head">
              <h2 id="listed">In court today</h2>
              <Link to="/diary" className={openLink}>Diary</Link>
            </div>
            {hearings.length === 0 ? <EmptyNote>Nothing is in the diary for today.</EmptyNote> : <RowList>{hearings.map((h) => <HearingLine key={h.id} row={h} />)}</RowList>}
          </section>

          <section aria-labelledby="attention" className="page-section">
            <div className="section-head">
              <h2 id="attention">Needs attention</h2>
              {attention.length > 0 && <Tag tone="open">{plural(attention.length, 'item')}</Tag>}
            </div>
            {attention.length === 0 ? (
              <EmptyNote>Nothing needs attention. Every hearing is closed, every open matter has a hearing listed, and no task is due.</EmptyNote>
            ) : (
              <RowList>
                {attention.map((item, index) => {
                  const d = describe(item)
                  return (
                    <Row
                      key={`${item.kind}:${item.refId ?? item.matterId}:${index}`}
                      marker={d.tone}
                      title={item.matterTitle ? `${item.courtNumber ? `${item.courtNumber}, ` : ''}${item.matterTitle}` : 'A task with no matter'}
                      summary={d.text}
                      trailing={
                        <>
                          <Tag tone={d.tone}>{d.tag}</Tag>
                          {item.matterId && (
                            <Link to="/matters/$matterId" params={{ matterId: item.matterId }} className={openLink}>Open</Link>
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
          <section aria-labelledby="upcoming" className="page-section">
            <h2 id="upcoming">The week ahead</h2>
            {upcoming.length === 0 ? (
              <EmptyNote>Nothing is listed for the next seven days.</EmptyNote>
            ) : (
              <RowList>
                {upcoming.map((h) => (
                  <Row
                    key={h.id}
                    aligned
                    title={`${format(h.at, 'EEE d MMM, HH:mm')}`}
                    summary={
                      <Link to="/matters/$matterId" params={{ matterId: h.matterId }} className="text-foreground">
                        {h.courtNumber ? `${h.courtNumber}, ` : ''}
                        {h.matterTitle}, {purposeLabel(h.purpose).toLowerCase()}
                      </Link>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="trend" className="page-section">
            <h2 id="trend">Adjournments, last 8 weeks</h2>
            <Card className="p-0">
              <CardContent className="p-0">
                <div className="flex justify-between p-5">
                  <p className="tabular-nums">{plural(today.recentAdjournments.length, 'adjournment')}</p>
                  <p className="tabular-nums">Peak: {peak}/wk</p>
                </div>
                <Sparkline data={buckets} />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="reasons" className="page-section">
            <h2 id="reasons">Why hearings were adjourned</h2>
            {today.reasonCounts.length === 0 ? (
              <EmptyNote>No hearing has been adjourned in this period.</EmptyNote>
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
