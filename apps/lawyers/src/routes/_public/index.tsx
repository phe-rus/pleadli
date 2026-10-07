import { formatDay, formatTime, formatWeekday } from '@/lib/dates'
import { getLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { PracticeDeadlines } from '@/features/clocks'
import { HearingActions, purposeLabel, reasonLabel, type DiaryRow } from '@/features/hearings'
import { MatterForm } from '@/features/matters'
import { overviewOptions, useOverview, type Attention } from '@/features/overview'
import { AlarmClockIcon, Calendar03Icon, CheckmarkCircle02Icon, CourtHouseIcon, Folder01Icon, HandshakeIcon, Task01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...overviewOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function describe(item: Attention) {
  const at = item.at
  switch (item.kind) {
    case 'hearing_not_closed':
      return { late: true, icon: CourtHouseIcon, text: m["today.att.not_closed_text"]({ date: at ? formatDay(at) : m["today.att.earlier_date"]() }) }
    case 'no_hearing':
      return { late: false, icon: Folder01Icon, text: `${m["today.att.no_hearing_text"]()}${at ? ` ${m["today.att.last_hearing"]({ date: formatDay(at) })}` : ''}` }
    case 'task_overdue':
      return { late: true, icon: AlarmClockIcon, text: m["today.att.was_due"]({ task: item.detail ?? m["today.att.a_task"](), date: at ? formatDay(at) : m["today.att.earlier_date"]() }) }
    case 'task_soon':
      return { late: false, icon: Task01Icon, text: m["today.att.is_due"]({ task: item.detail ?? m["today.att.a_task"](), date: at ? formatWeekday(at) : '' }) }
    case 'plea_unconfirmed':
      return { late: false, icon: HandshakeIcon, text: at ? m["today.att.plea_signed_text"]({ date: formatDay(at) }) : m["today.att.plea_text"]() }
  }
}

const matterName = (courtNumber: string | null | undefined, title: string) => `${courtNumber ? `${courtNumber}, ` : ''}${title}`

/** One hearing today: the time, the matter, and closing it in place. */
function HearingRow({ row }: { row: DiaryRow }) {
  const remanded = row.clientCustody === 'remanded'
  return (
    <GroupRow
      icon={<span className="text-[0.8125rem] font-medium tabular-nums text-foreground">{formatTime(row.at)}</span>}
      label={
        <Link to="/matters/$matterId" params={{ matterId: row.matterId }} className="text-foreground no-underline hover:underline">
          {matterName(row.courtNumber, row.matterTitle)}
        </Link>
      }
      detail={`${purposeLabel(row.purpose)}${row.courtroom ? `, ${row.courtroom}` : ''} · ${row.clientName}${remanded ? `, ${m["today.on_remand"]()}` : ''}`}
      value={
        row.status === 'scheduled' ? (
          <HearingActions hearing={row} matterId={row.matterId} />
        ) : (
          <Tag tone={row.status === 'attended' ? 'done' : row.status === 'missed' ? 'urgent' : 'waiting'}>{row.status === 'attended' ? m["today.attended"]() : row.status === 'missed' ? m["today.missed"]() : m["today.adjourned"]()}</Tag>
        )
      }
    />
  )
}

/** The advocate's home: what is in court today, what needs them, the few
 * figures worth knowing and the week ahead. Every line is read from the
 * record; a section with nothing behind it does not appear. */
function RouteComponent() {
  const navigate = useNavigate()
  const { data: today } = useOverview()
  const { counts, attention, hearings, upcoming } = today

  // Only figures with something behind them: a row of zeros tells nobody anything.
  const figures = [
    { id: 'open', label: m["today.open_matters"](), value: counts.openMatters, tone: 'plain' as const, go: () => navigate({ to: '/matters', search: { view: 'open' } }) },
    { id: 'no_hearing', label: m["nav.no_hearing"](), value: counts.noHearing, tone: 'attention' as const, go: () => navigate({ to: '/matters', search: { view: 'no_hearing' } }) },
    { id: 'tasks', label: m["today.tasks"](), value: counts.tasksOpen, tone: counts.tasksOverdue > 0 ? ('urgent' as const) : ('plain' as const), hint: counts.tasksOverdue > 0 ? m["today.overdue_count"]({ count: String(counts.tasksOverdue) }) : undefined, go: () => navigate({ to: '/tasks' }) },
    { id: 'drafts', label: m["today.drafts"](), value: counts.draftDocuments, tone: 'plain' as const, hint: m["today.not_filed"](), go: () => navigate({ to: '/documents' }) },
  ].filter((f) => f.value > 0)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full' }).format(new Date())}</p>
          <h1>{m["today.title"]()}</h1>
        </div>
        <div className="page-actions">
          <PanelButton label={m["today.open_matter"]()} title={m["today.open_matter"]()} description={m["today.open_matter_description"]()} variant="default">
            {({ close, setDirty }) => <MatterForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <PracticeDeadlines />

      {hearings.length === 0 && attention.length === 0 && <EmptyNote icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} />}>{m["today.all_clear"]()}</EmptyNote>}

      {hearings.length > 0 && (
        <Group
          title={m["today.in_court"]()}
          action={
            <Link to="/diary" className="text-[0.8125rem]">
              {m["nav.diary"]()}
            </Link>
          }
        >
          {hearings.map((h) => (
            <HearingRow key={h.id} row={h} />
          ))}
        </Group>
      )}

      {attention.length > 0 && (
        <Group title={`${m["today.attention"]()} · ${attention.length}`}>
          {attention.map((item, index) => {
            const d = describe(item)
            const row = {
              icon: (
                <RowIcon tone={d.late ? 'red' : 'gray'}>
                  <HugeiconsIcon icon={d.icon} />
                </RowIcon>
              ),
              label: item.matterTitle ? matterName(item.courtNumber, item.matterTitle) : m["today.task_no_matter"](),
              detail: d.text,
            }
            const key = `${item.kind}:${item.refId ?? item.matterId}:${index}`
            return item.matterId ? (
              <GroupRow
                key={key}
                {...row}
                chevron
                render={({ className, children }) => (
                  <Link to="/matters/$matterId" params={{ matterId: item.matterId! }} className={className}>
                    {children}
                  </Link>
                )}
              />
            ) : (
              <GroupRow key={key} {...row} chevron onClick={() => void navigate({ to: '/tasks' })} />
            )
          })}
        </Group>
      )}

      {figures.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between px-1">
            <h2 data-slot="group-title">{m["today.figures"]()}</h2>
            <Link to="/statistics" className="text-[0.8125rem]">
              {m["nav.statistics"]()}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map((f) => (
              <Stat key={f.id} label={f.label} value={f.value} tone={f.tone} hint={f.hint} onClick={() => void f.go()} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <Group
          title={m["today.week_ahead"]()}
          action={
            <Link to="/calendar" className="text-[0.8125rem]">
              {m["nav.calendar"]()}
            </Link>
          }
        >
          {upcoming.map((h) => (
            <GroupRow
              key={h.id}
              icon={
                <RowIcon>
                  <HugeiconsIcon icon={Calendar03Icon} />
                </RowIcon>
              }
              label={matterName(h.courtNumber, h.matterTitle)}
              detail={`${formatWeekday(h.at)}, ${formatTime(h.at)} · ${purposeLabel(h.purpose)}`}
              chevron
              render={({ className, children }) => (
                <Link to="/matters/$matterId" params={{ matterId: h.matterId }} className={className}>
                  {children}
                </Link>
              )}
            />
          ))}
        </Group>
      )}

      {today.reasonCounts.length > 0 && (
        <Group title={m["today.reasons"]()} footer={m["today.adjournments_count"]({ count: String(today.recentAdjournments.length) })}>
          {today.reasonCounts.map((r) => (
            <GroupRow key={r.reason} label={reasonLabel(r.reason)} value={<span className="tabular-nums">{r.count}</span>} />
          ))}
        </Group>
      )}
    </article>
  )
}
