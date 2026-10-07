import { formatDate, formatRelative } from '@/lib/dates'
import { clockSentence, computeClocks, urgent, useCustody } from '@/features/custody'
import { useBoard } from '@/features/pipeline'
import { useJurisdiction } from '@/features/installation'
import { packText } from '@/lib/jurisdiction'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { fileReference, filesOptions, ProsecutionFileForm, useFiles } from '@/features/prosecution-files'
import { activityOptions, describeEvent, useActivity, useWorkload, workloadOptions } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Clock01Icon, CourtHouseIcon, File02Icon, FileImportIcon, Folder01Icon, InboxIcon, PoliceCapIcon, RepeatIcon, SentIcon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    const { queryClient } = context
    await Promise.all([
      queryClient.query({ ...workloadOptions(), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('awaiting'), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('returned'), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('reopened'), staleTime: 'static' }),
      queryClient.query({ ...activityOptions(8), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/** The prosecutor's operational home: what needs attention now, how much work
 * is sitting here, and what has just happened. Every line is read from the
 * record. A section with nothing behind it does not appear, and there is no
 * date here that the record itself does not fix. */
function RouteComponent() {
  const navigate = useNavigate()
  const { data: workload } = useWorkload()
  const { data: awaiting } = useFiles('awaiting')
  const { data: returned } = useFiles('returned')
  const { data: reopened } = useFiles('reopened')
  const { data: activity } = useActivity(8)

  const resubmitted = awaiting.filter((f) => f.currentStatus === 'resubmitted')
  const unreviewedOrActive = awaiting.filter((f) => f.currentStatus === 'under_review')
  const attentionCount =
    workload.thresholdReviews.length + reopened.length + (workload.draftDocuments > 0 ? 1 : 0) + (workload.incomingWaiting > 0 ? 1 : 0) + (workload.outgoingPending > 0 ? 1 : 0) + resubmitted.length + unreviewedOrActive.length + returned.length + (workload.chargedWithoutCourtReference > 0 ? 1 : 0)

  // Only figures with something behind them: a row of zeros tells nobody anything.
  const figures = [
    { id: 'awaiting', label: m["overview.figure.awaiting_decision"](), value: workload.awaitingDecision, tone: 'attention' as const, view: 'review' as const },
    { id: 'returned', label: m["file.view.returned.label"](), value: workload.returned, tone: 'plain' as const, view: 'returned' as const },
    { id: 'reopened', label: m["overview.figure.reopened"](), value: workload.reopened, tone: 'attention' as const, view: 'reopened' as const },
    { id: 'decided', label: m["overview.figure.decided_30"](), value: workload.decisionsLast30Days, tone: 'plain' as const, view: 'all' as const },
  ].filter((f) => f.value > 0)

  const fileRow = (key: string, fileId: string, tab: string | undefined, icon: ReactNode, label: string, detail: string) => (
    <GroupRow
      key={key}
      icon={icon}
      label={label}
      detail={detail}
      chevron
      render={({ className, children }) => (
        <Link to="/files/$fileId" params={{ fileId }} search={tab ? { tab: tab as 'case' } : {}} className={className}>
          {children}
        </Link>
      )}
    />
  )
  const placeRow = (key: string, to: string, icon: ReactNode, label: string, detail: string) => (
    <GroupRow
      key={key}
      icon={icon}
      label={label}
      detail={detail}
      chevron
      render={({ className, children }) => (
        <Link to={to} className={className}>
          {children}
        </Link>
      )}
    />
  )
  const icon = (glyph: typeof Clock01Icon, tone: Parameters<typeof RowIcon>[0]['tone']) => (
    <RowIcon tone={tone}>
      <HugeiconsIcon icon={glyph} />
    </RowIcon>
  )

  return (
    <article className="page page-narrow">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{formatDate(new Date(), 'weekday')}</p>
          <h1>{m["nav.item.overview"]()}</h1>
        </div>
        <div className="page-actions">
          <PanelButton label={m["workspace.quick.open_file"]()} title={m["workspace.quick.open_file"]()} description={m["workspace.quick.open_file_description"]()} variant="default">
            {({ close, setDirty }) => (
              <ProsecutionFileForm
                onDirtyChange={setDirty}
                onSuccess={(file) => {
                  close()
                  // A new file opens straight away, on its (empty) folder, ready for the paper.
                  void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      <TimeLimits />

      {attentionCount === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} />}>{m["overview.attention.empty"]()}</EmptyNote>
      ) : (
        <Group title={`${m["overview.attention.title"]()} · ${attentionCount}`}>
          {workload.thresholdReviews.map((review) => {
            const days = differenceInCalendarDays(review.dueAt, new Date())
            return fileRow(
              `threshold:${review.fileId}`,
              review.fileId,
              'case',
              icon(Clock01Icon, days < 0 ? 'red' : 'orange'),
              review.fileTitle,
              days < 0
                ? m["overview.attention.threshold_overdue"]({ date: formatDate(review.dueAt) })
                : m["overview.attention.threshold_due"]({ date: formatDate(review.dueAt), left: plural(days, m["count.day.one"], m["count.day.many"]) }),
            )
          })}
          {reopened.map((file) => fileRow(`reopened:${file.id}`, file.id, 'case', icon(RepeatIcon, 'purple'), file.title, m["overview.attention.reopened"]({ reference: fileReference(file) })))}
          {resubmitted.map((file) =>
            fileRow(
              `resubmitted:${file.id}`,
              file.id,
              'case',
              icon(FileImportIcon, 'blue'),
              file.title,
              `${m["overview.attention.resubmitted"]({ reference: fileReference(file), age: ageLabel(file.awaitingSince).toLowerCase() })}${file.directionsTotal > 0 ? ` ${m["overview.attention.directions_open"]({ open: file.directionsOpen, total: file.directionsTotal })}` : ''}`,
            ),
          )}
          {unreviewedOrActive.map((file) =>
            fileRow(
              `awaiting:${file.id}`,
              file.id,
              undefined,
              icon(Folder01Icon, 'blue'),
              file.title,
              `${[fileReference(file), file.accused].filter(Boolean).join(' · ')} · ${m["overview.waiting"]({ age: ageLabel(file.awaitingSince).toLowerCase() })}`,
            ),
          )}
          {returned.map((file) =>
            fileRow(
              `returned:${file.id}`,
              file.id,
              'case',
              icon(PoliceCapIcon, 'gray'),
              file.title,
              file.lastDecisionAt ? m["overview.attention.returned_since"]({ reference: fileReference(file), date: formatDate(file.lastDecisionAt) }) : m["overview.attention.returned"]({ reference: fileReference(file) }),
            ),
          )}
          {workload.incomingWaiting > 0 &&
            placeRow('incoming', '/incoming', icon(InboxIcon, 'blue'), m["overview.attention.incoming_title"]({ referrals: plural(workload.incomingWaiting, m["count.referral.one"], m["count.referral.many"]) }), m["overview.attention.incoming_summary"]())}
          {workload.outgoingPending > 0 &&
            placeRow('outgoing', '/incoming', icon(SentIcon, 'teal'), m["overview.attention.outgoing_title"]({ items: plural(workload.outgoingPending, m["count.receipt_or_notice.one"], m["count.receipt_or_notice.many"]) }), m["overview.attention.outgoing_summary"]())}
          {workload.draftDocuments > 0 &&
            placeRow('drafts', '/documents', icon(File02Icon, 'orange'), m["overview.attention.drafts_title"]({ documents: plural(workload.draftDocuments, m["count.document.one"], m["count.document.many"]) }), m["overview.attention.drafts_summary"]())}
          {workload.chargedWithoutCourtReference > 0 &&
            placeRow('court-ref', '/court-matters', icon(CourtHouseIcon, 'gray'), m["overview.attention.no_court_ref_title"]({ files: plural(workload.chargedWithoutCourtReference, m["count.charged_file.one"], m["count.charged_file.many"]) }), m["overview.attention.no_court_ref_summary"]())}
        </Group>
      )}

      {figures.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between px-1">
            <h2 data-slot="group-title">{m["overview.workload"]()}</h2>
            <Link to="/capacity" className="text-[0.8125rem]">
              {m["nav.item.workload"]()}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map((f) => (
              <Stat key={f.id} label={f.label} value={f.value} tone={f.tone} onClick={() => void navigate({ to: '/files', search: { view: f.view } })} />
            ))}
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <Group title={m["overview.activity"]()}>
          {activity.map((event) => {
            const { title } = describeEvent(event)
            return (
              <GroupRow
                key={`${event.kind}:${event.id}`}
                label={title}
                detail={event.fileTitle}
                value={<span className="text-xs">{formatRelative(event.at)}</span>}
                render={({ className, children }) => (
                  <Link to="/files/$fileId" params={{ fileId: event.fileId }} search={{ tab: 'activity' }} className={className}>
                    {children}
                  </Link>
                )}
              />
            )
          })}
        </Group>
      )}
    </article>
  )
}

/** Every open file whose legal clock has run out or is about to, first on
 * the page: nothing else on Today matters more than an unlawful detention. */
function TimeLimits() {
  const { data: events = [] } = useCustody()
  const { data: cards = [] } = useBoard()
  const country = useJurisdiction()
  const rows = cards.flatMap((card) => urgent(computeClocks(events.filter((e) => e.prosecutionFileId === card.id), country)).map((clock) => ({ card, clock })))
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="limits" className="flex flex-col gap-2 rounded-xl bg-destructive/[0.06] p-4 ring-1 ring-destructive/20">
      <h2 id="limits" className="text-destructive">{m["clock.today_title"]({ count: rows.length })}</h2>
      <ul className="flex list-none flex-col gap-1 p-0">
        {rows.map(({ card, clock }, i) => (
          <li key={`${card.id}-${i}`}>
            <Link to="/files/$fileId" params={{ fileId: card.id }} search={{ tab: 'case' }} className="-mx-2 flex flex-col rounded-xl px-2 py-1.5 text-foreground no-underline hover:bg-destructive/10">
              <strong>
                {card.title}
                {clock.person ? ` · ${clock.person}` : ''}
              </strong>
              <span className={clock.status === 'overdue' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'}>
                {packText(clock.limit.label)}: {clockSentence(clock)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
