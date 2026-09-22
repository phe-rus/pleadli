import { PanelButton } from '@/components/add-panel'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { FileStatusTag, Tag } from '@/components/status-tag'
import { PersonForm } from '@/features/people'
import { fileReference, filesOptions, ProsecutionFileForm, useFiles } from '@/features/prosecution-files'
import { activityOptions, describeEvent, useActivity, useWorkload, workloadOptions } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import { createFileRoute, Link } from '@tanstack/react-router'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'

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
    { label: 'Active files', value: workload.awaitingDecision + workload.returned, to: '/files', search: { view: 'all' as const } },
    { label: 'Awaiting a decision', value: workload.awaitingDecision, to: '/files', search: { view: 'active' as const } },
    { label: 'Returned to Police', value: workload.returned, to: '/files', search: { view: 'returned' as const } },
    { label: 'Resubmitted', value: workload.resubmitted, to: '/files', search: { view: 'active' as const } },
    { label: 'Reopened', value: workload.reopened, to: '/files', search: { view: 'reopened' as const } },
    { label: 'Decisions recorded', value: workload.decisionsTotal, to: '/decisions', search: {} },
    { label: 'With a court reference', value: workload.courtMatters, to: '/court-matters', search: {} },
  ]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Overview</h1>
          <p>{format(new Date(), 'EEEE d MMMM yyyy')}. What needs your attention, and how much is on your desk.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Open a file" title="Open a file" description="Log a matter referred by Police." variant="default">
            {({ close, setDirty }) => <ProsecutionFileForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
          <PanelButton label="Add a person" title="Add a person" description="Someone who appears on a file: accused, complainant or witness.">
            {({ close, setDirty }) => <PersonForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="attention" className="page-section">
          <div className="section-head">
            <h2 id="attention">Needs attention</h2>
            {attentionCount > 0 && <Tag tone="open">{plural(attentionCount, 'item')}</Tag>}
          </div>

          {attentionCount === 0 ? (
            <EmptyNote>Nothing needs attention. No file is waiting on a decision, none is with Police, and no review is due.</EmptyNote>
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
                        ? `Threshold Test review was due ${format(review.dueAt, 'PP')}. The 14-day review clears when a later decision is recorded.`
                        : `Threshold Test review due ${format(review.dueAt, 'PP')} (${plural(days, 'day')} left).`
                    }
                    trailing={
                      <>
                        <Tag tone={days < 0 ? 'urgent' : 'open'}>{days < 0 ? 'Review overdue' : 'Review due'}</Tag>
                        <Link to="/files/$fileId" params={{ fileId: review.fileId }} search={{ tab: 'decisions' }} className={openLink}>Open</Link>
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
                  summary={`${fileReference(file)}. A concluded decision has been reopened and is under review.`}
                  trailing={
                    <>
                      <Tag tone="open">Reopened</Tag>
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className={openLink}>Review</Link>
                    </>
                  }
                />
              ))}

              {resubmitted.map((file) => (
                <Row
                  key={`resubmitted:${file.id}`}
                  marker="open"
                  title={file.title}
                  summary={`${fileReference(file)}. Resubmitted by Police ${ageLabel(file.awaitingSince).toLowerCase()} ago, awaiting review.${file.directionsTotal > 0 ? ` ${file.directionsOpen} of ${file.directionsTotal} directions still open.` : ''}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: file.directionsOpen > 0 ? 'decisions' : 'material' }} className={openLink}>Review</Link>
                    </>
                  }
                />
              ))}

              {unreviewedOrActive.map((file) => (
                <Row
                  key={`awaiting:${file.id}`}
                  marker="open"
                  title={file.title}
                  summary={`${fileReference(file)}${file.accused ? `. ${file.accused}` : ''}. Waiting ${ageLabel(file.awaitingSince).toLowerCase()}. ${file.reviewNoteCount === 0 ? 'No review recorded yet.' : `${plural(file.reviewNoteCount, 'review note')}.`}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} className={openLink}>Open</Link>
                    </>
                  }
                />
              ))}

              {returned.map((file) => (
                <Row
                  key={`returned:${file.id}`}
                  aligned
                  title={file.title}
                  summary={`${fileReference(file)}. With Police for further investigation${file.lastDecisionAt ? ` since ${format(file.lastDecisionAt, 'PP')}` : ''}. Waiting for the resubmission.${file.directionsTotal > 0 ? ` ${plural(file.directionsTotal, 'direction')} given.` : ''}`}
                  trailing={
                    <>
                      <FileStatusTag status={file.currentStatus} />
                      <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'decisions' }} className={openLink}>Open</Link>
                    </>
                  }
                />
              ))}

              {workload.incomingWaiting > 0 && (
                <Row
                  marker="open"
                  title={`${plural(workload.incomingWaiting, 'referral')} from Police waiting to be read`}
                  summary="Held apart from the records until you read and accept them."
                  trailing={<Link to="/incoming" className={openLink}>Incoming</Link>}
                />
              )}

              {workload.outgoingPending > 0 && (
                <Row
                  aligned
                  title={`${plural(workload.outgoingPending, 'receipt or notice')} prepared for Police, not sent yet`}
                  summary="Save each file and send it to the station."
                  trailing={<Link to="/incoming" className={openLink}>Incoming</Link>}
                />
              )}

              {workload.draftDocuments > 0 && (
                <Row
                  aligned
                  title={`${plural(workload.draftDocuments, 'document')} prepared but not issued`}
                  summary="A draft follows the record until it is issued. Read it, then issue it."
                  trailing={<Link to="/documents" className={openLink}>Documents</Link>}
                />
              )}

              {workload.chargedWithoutCourtReference > 0 && (
                <Row
                  aligned
                  title={`${plural(workload.chargedWithoutCourtReference, 'charged file')} without a court case number`}
                  summary="Record the court reference once the charge sheet has been filed."
                  trailing={<Link to="/court-matters" className={openLink}>Court matters</Link>}
                />
              )}
            </RowList>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="workload" className="page-section">
            <div className="section-head">
              <h2 id="workload">Current workload</h2>
              <Link to="/capacity" className={openLink}>Capacity and workload</Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              {figures.map((figure) => (
                <Link key={figure.label} to={figure.to} search={figure.search} className="flex flex-col no-underline">
                  <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                  <dd className="text-2xl font-semibold text-foreground tabular-nums">{figure.value}</dd>
                </Link>
              ))}
            </dl>
          </section>

          <section aria-labelledby="activity" className="page-section">
            <h2 id="activity">Recent activity</h2>
            {activity.length === 0 ? (
              <EmptyNote>Nothing has been recorded yet.</EmptyNote>
            ) : (
              <RowList>
                {activity.map((event) => {
                  const { title } = describeEvent(event)
                  return (
                    <Row
                      key={`${event.kind}:${event.id}`}
                      title={title}
                      summary={
                        <>
                          <Link to="/files/$fileId" params={{ fileId: event.fileId }} search={{ tab: 'chronology' }} className="text-foreground">
                            {event.fileTitle}
                          </Link>
                          . {formatDistanceToNowStrict(event.at, { addSuffix: true })}.
                        </>
                      }
                    />
                  )
                })}
              </RowList>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
