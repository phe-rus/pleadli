import { formatDay, formatTime, formatWeekday } from '@/lib/dates'
import { getLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { AlertBanner } from '@/components/alert-banner'
import { Sparkline } from '@/components/charts/sparkline'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { PracticeDeadlines } from '@/features/clocks'
import { HearingActions, purposeLabel, reasonLabel, type DiaryRow } from '@/features/hearings'
import { MatterForm } from '@/features/matters'
import { overviewOptions, useOverview, type Attention } from '@/features/overview'
import { weeklyBuckets } from '@/lib/weekly-buckets'
import { AlarmClockIcon, CalendarCheckOut01Icon, FolderViewIcon, LegalDocument01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardContent } from '@pleadli/ui/card'
import { createFileRoute, Link } from '@tanstack/react-router'
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
      return { tone: 'urgent' as const, tag: m["today.att.not_closed"](), text: m["today.att.not_closed_text"]({ date: at ? formatDay(at) : m["today.att.earlier_date"]() }) }
    case 'no_hearing':
      return { tone: 'open' as const, tag: m["today.no_hearing_listed"](), text: `${m["today.att.no_hearing_text"]()}${at ? ` ${m["today.att.last_hearing"]({ date: formatDay(at) })}` : ''}` }
    case 'task_overdue':
      return { tone: 'urgent' as const, tag: m["today.att.overdue"](), text: m["today.att.was_due"]({ task: item.detail ?? m["today.att.a_task"](), date: at ? formatDay(at) : m["today.att.earlier_date"]() }) }
    case 'task_soon':
      return { tone: 'open' as const, tag: m["today.att.due_soon"](), text: m["today.att.is_due"]({ task: item.detail ?? m["today.att.a_task"](), date: at ? formatWeekday(at) : '' }) }
    case 'plea_unconfirmed':
      return { tone: 'open' as const, tag: m["today.att.plea_agreed"](), text: at ? m["today.att.plea_signed_text"]({ date: formatDay(at) }) : m["today.att.plea_text"]() }
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
          {formatTime(row.at)}{' '}
          <Link to="/matters/$matterId" params={{ matterId: row.matterId }} className="text-foreground">
            {row.courtNumber ? `${row.courtNumber}, ` : ''}
            {row.matterTitle}
          </Link>
        </>
      }
      summary={`${purposeLabel(row.purpose)}${row.courtroom ? `, ${row.courtroom}` : ''}. ${row.clientName}${remanded ? `, ${m["today.on_remand"]()}` : ''}.`}
      trailing={
        row.status === 'scheduled' ? (
          <HearingActions hearing={row} matterId={row.matterId} />
        ) : (
          <Tag tone={row.status === 'attended' ? 'done' : row.status === 'missed' ? 'urgent' : 'waiting'}>{row.status === 'attended' ? m["today.attended"]() : row.status === 'missed' ? m["today.missed"]() : m["today.adjourned"]()}</Tag>
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
        <AlertBanner tone="urgent" title={m["today.left_open"]()} action={<Link to="/tasks" className={openLink}>{m["today.tasks"]()}</Link>}>
          {m["today.left_open_body"]({ count: String(urgent.length) })}
        </AlertBanner>
      )}
      {counts.noHearing > 0 && (
        <AlertBanner tone="attention" title={m["today.no_hearing_listed"]()} action={<Link to="/matters" search={{ view: 'no_hearing' }} className={openLink}>{m["today.open_list"]()}</Link>}>
          {m["today.no_hearing_body"]({ count: String(counts.noHearing) })}
        </AlertBanner>
      )}

      <header className="page-header">
        <div>
          <h1>{m["today.title"]()}</h1>
          <p>{new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full' }).format(new Date())}. {m["today.lead"]()}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["today.open_matter"]()} title={m["today.open_matter"]()} description={m["today.open_matter_description"]()} variant="default">
            {({ close, setDirty }) => <MatterForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m["today.hearings_today"]()}
          icon={CalendarCheckOut01Icon}
          tint="primary"
          value={counts.hearingsToday}
          meta={counts.notClosed > 0 && <Badge variant="destructive">{counts.notClosed} not closed</Badge>}
          caption={counts.hearingsToday === 0 ? m["today.nothing_today"]() : m["today.in_diary_today"]()}
        />
        <StatTile label={m["today.open_matters"]()} icon={FolderViewIcon} tint="emerald" value={counts.openMatters} meta={<Badge variant="secondary">{m["today.with_no_hearing"]({ count: String(counts.noHearing) })}</Badge>} caption={m["today.matters_acting"]()} />
        <StatTile
          label={m["today.tasks"]()}
          icon={AlarmClockIcon}
          tint={counts.tasksOverdue > 0 ? 'rose' : 'amber'}
          value={counts.tasksOpen}
          meta={<Badge variant={counts.tasksOverdue > 0 ? 'destructive' : 'secondary'}>{counts.tasksOverdue > 0 ? m["today.overdue_count"]({ count: String(counts.tasksOverdue) }) : m["today.none_overdue"]()}</Badge>}
          caption={m["today.tasks_caption"]()}
        />
        <StatTile label={m["today.drafts"]()} icon={LegalDocument01Icon} tint="amber" value={counts.draftDocuments} meta={<Badge variant="secondary">{m["today.not_filed"]()}</Badge>} caption={m["today.drafts_caption"]()} />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <PracticeDeadlines />

          <section aria-labelledby="listed" className="page-section">
            <div className="section-head">
              <h2 id="listed">{m["today.in_court"]()}</h2>
              <Link to="/diary" className={openLink}>Diary</Link>
            </div>
            {hearings.length === 0 ? <EmptyNote>{m["today.nothing_today_full"]()}</EmptyNote> : <RowList>{hearings.map((h) => <HearingLine key={h.id} row={h} />)}</RowList>}
          </section>

          <section aria-labelledby="attention" className="page-section">
            <div className="section-head">
              <h2 id="attention">{m["today.attention"]()}</h2>
              {attention.length > 0 && <Tag tone="open">{m["today.items_count"]({ count: String(attention.length) })}</Tag>}
            </div>
            {attention.length === 0 ? (
              <EmptyNote>{m["today.nothing_attention"]()}</EmptyNote>
            ) : (
              <RowList>
                {attention.map((item, index) => {
                  const d = describe(item)
                  return (
                    <Row
                      key={`${item.kind}:${item.refId ?? item.matterId}:${index}`}
                      marker={d.tone}
                      title={item.matterTitle ? `${item.courtNumber ? `${item.courtNumber}, ` : ''}${item.matterTitle}` : m["today.task_no_matter"]()}
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
            <h2 id="upcoming">{m["today.week_ahead"]()}</h2>
            {upcoming.length === 0 ? (
              <EmptyNote>{m["today.nothing_week"]()}</EmptyNote>
            ) : (
              <RowList>
                {upcoming.map((h) => (
                  <Row
                    key={h.id}
                    aligned
                    title={`${formatWeekday(h.at)}, ${formatTime(h.at)}`}
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
            <h2 id="trend">{m["today.trend"]()}</h2>
            <Card className="p-0">
              <CardContent className="p-0">
                <div className="flex justify-between p-5">
                  <p className="tabular-nums">{m["today.adjournments_count"]({ count: String(today.recentAdjournments.length) })}</p>
                  <p className="tabular-nums">Peak: {peak}/wk</p>
                </div>
                <Sparkline data={buckets} />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="reasons" className="page-section">
            <h2 id="reasons">{m["today.reasons"]()}</h2>
            {today.reasonCounts.length === 0 ? (
              <EmptyNote>{m["today.no_adjournments"]()}</EmptyNote>
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
