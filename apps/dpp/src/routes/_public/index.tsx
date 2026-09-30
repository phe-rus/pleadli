import { formatDate, formatRelative } from '@/lib/dates'
import { clockSentence, computeClocks, urgent, useCustody } from '@/features/custody'
import { useBoard } from '@/features/pipeline'
import { useJurisdiction } from '@/features/installation'
import { packText } from '@/lib/jurisdiction'
import { PanelButton } from '@/components/add-panel'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { FileStatusTag, Tag } from '@/components/status-tag'
import { PersonForm } from '@/features/people'
import { fileReference, filesOptions, ProsecutionFileForm, useFiles } from '@/features/prosecution-files'
import { activityOptions, describeEvent, useActivity, useWorkload, workloadOptions } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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

const openLink = 'text-primary'

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

  const figures = [
    { id: 'active', label: m["overview.figure.active_files"](), value: workload.awaitingDecision + workload.returned, to: '/files', search: { view: 'all' as const } },
    { id: 'awaiting', label: m["overview.figure.awaiting_decision"](), value: workload.awaitingDecision, to: '/files', search: { view: 'active' as const } },
    { id: 'returned', label: m["nav.item.returned"](), value: workload.returned, to: '/files', search: { view: 'returned' as const } },
    { id: 'resubmitted', label: m["overview.figure.resubmitted"](), value: workload.resubmitted, to: '/files', search: { view: 'active' as const } },
    { id: 'reopened', label: m["overview.figure.reopened"](), value: workload.reopened, to: '/files', search: { view: 'reopened' as const } },
    { id: 'decisions', label: m["overview.figure.decisions_recorded"](), value: workload.decisionsTotal, to: '/decisions', search: {} },
    { id: 'court', label: m["overview.figure.with_court_reference"](), value: workload.courtMatters, to: '/court-matters', search: {} },
  ]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.overview"]()}</h1>
          <p>{m["overview.subtitle"]({ date: formatDate(new Date(), 'weekday') })}</p>
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
          <PanelButton label={m["workspace.quick.add_person"]()} title={m["workspace.quick.add_person"]()} description={m["workspace.quick.add_person_description"]()}>
            {({ close, setDirty }) => <PersonForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <TimeLimits />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="attention" className="page-section">
          <div className="section-head">
            <h2 id="attention">{m["overview.attention.title"]()}</h2>
            {attentionCount > 0 && <Tag tone="open">{plural(attentionCount, m["count.item.one"], m["count.item.many"])}</Tag>}
          </div>

          {attentionCount === 0 ? (
            <EmptyNote>{m["overview.attention.empty"]()}</EmptyNote>
          ) : (
            <RowList>
              {workload.thresholdReviews.map((review) => {
                const days = differenceInCalendarDays(review.dueAt, new Date())
                return (
                  <Row
                    key={`threshold:${review.fileId}`}
                    marker={days < 0 ? 'urgent' : 'open'}
                    title={review.fileTitle}
                    summary={
                      days < 0
                        ? m["overview.attention.threshold_overdue"]({ date: formatDate(review.dueAt) })
                        : m["overview.attention.threshold_due"]({ date: formatDate(review.dueAt), left: plural(days, m["count.day.one"], m["count.day.many"]) })
                    }
                    trailing={
                      <>
                        <Tag tone={days < 0 ? 'urgent' : 'open'}>{days < 0 ? m["overview.attention.review_overdue"]() : m["overview.attention.review_due"]()}</Tag>
                        <Link to="/files/$fileId" params={{ fileId: review.fileId }} search={{ tab: 'decisions' }} className={openLink}>{m["common.open"]()}</Link>
                      </>
                    }
                  />
                )
              })}

              {reopened.map((file) => (
                <Row
                  key={`reopened:${file.id}`}
                  marker="open"
                  title={file.title}
                  summary={m["overview.attention.reopened"]({ reference: fileReference(file) })}
                  trailing={
                    <>
                      <Tag tone="open">{m["overview.figure.reopened"]()}</Tag>
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className={openLink}>{m["common.review"]()}</Link>
                    </>
                  }
                />
              ))}

              {resubmitted.map((file) => (
                <Row
                  key={`resubmitted:${file.id}`}
                  marker="open"
                  title={file.title}
                  summary={`${m["overview.attention.resubmitted"]({ reference: fileReference(file), age: ageLabel(file.awaitingSince).toLowerCase() })}${file.directionsTotal > 0 ? ` ${m["overview.attention.directions_open"]({ open: file.directionsOpen, total: file.directionsTotal })}` : ''}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: file.directionsOpen > 0 ? 'decisions' : 'material' }} className={openLink}>{m["common.review"]()}</Link>
                    </>
                  }
                />
              ))}

              {unreviewedOrActive.map((file) => (
                <Row
                  key={`awaiting:${file.id}`}
                  marker="open"
                  title={file.title}
                  summary={`${fileReference(file)}${file.accused ? `. ${file.accused}` : ''}. ${m["overview.waiting"]({ age: ageLabel(file.awaitingSince).toLowerCase() })} ${file.reviewNoteCount === 0 ? m["overview.attention.no_review"]() : `${plural(file.reviewNoteCount, m["count.review_note.one"], m["count.review_note.many"])}.`}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} className={openLink}>{m["common.open"]()}</Link>
                    </>
                  }
                />
              ))}

              {returned.map((file) => (
                <Row
                  key={`returned:${file.id}`}
                  aligned
                  title={file.title}
                  summary={`${file.lastDecisionAt ? m["overview.attention.returned_since"]({ reference: fileReference(file), date: formatDate(file.lastDecisionAt) }) : m["overview.attention.returned"]({ reference: fileReference(file) })}${file.directionsTotal > 0 ? ` ${m["overview.attention.directions_given"]({ directions: plural(file.directionsTotal, m["count.direction.one"], m["count.direction.many"]) })}` : ''}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'decisions' }} className={openLink}>{m["common.open"]()}</Link>
                    </>
                  }
                />
              ))}

              {workload.incomingWaiting > 0 && (
                <Row
                  marker="open"
                  title={m["overview.attention.incoming_title"]({ referrals: plural(workload.incomingWaiting, m["count.referral.one"], m["count.referral.many"]) })}
                  summary={m["overview.attention.incoming_summary"]()}
                  trailing={<Link to="/incoming" className={openLink}>{m["nav.item.incoming"]()}</Link>}
                />
              )}

              {workload.outgoingPending > 0 && (
                <Row
                  aligned
                  title={m["overview.attention.outgoing_title"]({ items: plural(workload.outgoingPending, m["count.receipt_or_notice.one"], m["count.receipt_or_notice.many"]) })}
                  summary={m["overview.attention.outgoing_summary"]()}
                  trailing={<Link to="/incoming" className={openLink}>{m["nav.item.incoming"]()}</Link>}
                />
              )}

              {workload.draftDocuments > 0 && (
                <Row
                  aligned
                  title={m["overview.attention.drafts_title"]({ documents: plural(workload.draftDocuments, m["count.document.one"], m["count.document.many"]) })}
                  summary={m["overview.attention.drafts_summary"]()}
                  trailing={<Link to="/documents" className={openLink}>{m["nav.item.documents"]()}</Link>}
                />
              )}

              {workload.chargedWithoutCourtReference > 0 && (
                <Row
                  aligned
                  title={m["overview.attention.no_court_ref_title"]({ files: plural(workload.chargedWithoutCourtReference, m["count.charged_file.one"], m["count.charged_file.many"]) })}
                  summary={m["overview.attention.no_court_ref_summary"]()}
                  trailing={<Link to="/court-matters" className={openLink}>{m["nav.item.court_matters"]()}</Link>}
                />
              )}
            </RowList>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="workload" className="page-section">
            <div className="section-head">
              <h2 id="workload">{m["overview.workload"]()}</h2>
              <Link to="/capacity" className={openLink}>{m["nav.item.capacity"]()}</Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              {figures.map((figure) => (
                <Link key={figure.id} to={figure.to} search={figure.search} className="flex flex-col no-underline">
                  <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                  <dd className="text-2xl font-semibold text-foreground tabular-nums">{figure.value}</dd>
                </Link>
              ))}
            </dl>
          </section>

          <section aria-labelledby="activity" className="page-section">
            <h2 id="activity">{m["overview.activity"]()}</h2>
            {activity.length === 0 ? (
              <EmptyNote>{m["overview.activity_empty"]()}</EmptyNote>
            ) : (
              <ol className="flex list-none flex-col gap-1 p-0">
                {activity.map((event) => {
                  const { title } = describeEvent(event)
                  return (
                    <li key={`${event.kind}:${event.id}`}>
                      {/* The whole row opens the file's history: an easy target, not a small link. */}
                      <Link
                        to="/files/$fileId"
                        params={{ fileId: event.fileId }}
                        search={{ tab: 'activity' }}
                        className="-mx-2 flex flex-col gap-0.5 rounded-xl px-2 py-2 text-foreground no-underline transition-colors hover:bg-secondary/60"
                      >
                        <strong>{title}</strong>
                        <span className="text-muted-foreground">
                          {event.fileTitle} · {formatRelative(event.at)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
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
    <section aria-labelledby="limits" className="flex flex-col gap-2 rounded-2xl bg-destructive/5 p-4 ring-1 ring-destructive/20">
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
