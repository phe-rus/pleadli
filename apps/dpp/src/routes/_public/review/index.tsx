import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { FileStatusTag, Tag } from '@/components/status-tag'
import { ReviewStages, reviewStagesOverview } from '@/features/file-workspace/review-stages'
import { fileReference, filesOptions, useFiles } from '@/features/prosecution-files'
import { useWorkload, workloadOptions } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/review/')({
  loader: async ({ context }) => {
    const { queryClient } = context
    await Promise.all([
      queryClient.query({ ...workloadOptions(), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('reopened'), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('awaiting'), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/** Where charging review work is: every file waiting on a decision, oldest
 * first, with how far its review has got. The review itself happens in the
 * file's Review tab. */
function RouteComponent() {
  const { data: files } = useFiles('awaiting')
  const { data: reopened } = useFiles('reopened')
  const { data: workload } = useWorkload()

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Charging review</h1>
          <p>Files waiting on a charging decision, oldest first. The review is done inside each file.</p>
        </div>
      </header>

      <section className="page-section">
        <h2>The review</h2>
        <ReviewStages stages={reviewStagesOverview()} />
        <p>Reviews are recorded inside each file. A return for further investigation carries directions to Police.</p>
      </section>

      {workload.thresholdReviews.length > 0 && (
        <section className="page-section">
          <h2>Threshold Test reviews</h2>
          <RowList>
            {workload.thresholdReviews.map((review) => (
              <Row
                key={review.fileId}
                marker={review.dueAt < Date.now() ? 'urgent' : 'open'}
                title={review.fileTitle}
                summary={`Charged on the Threshold Test ${format(review.decidedAt, 'PP')}. The 14-day review ${review.dueAt < Date.now() ? 'was due' : 'is due'} ${format(review.dueAt, 'PP')}.`}
                trailing={<Link to="/files/$fileId" params={{ fileId: review.fileId }} search={{ tab: 'decisions' }} className="text-primary">Open</Link>}
              />
            ))}
          </RowList>
        </section>
      )}

      {reopened.length > 0 && (
        <section className="page-section">
          <h2>Reopened</h2>
          <RowList>
            {reopened.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={`${fileReference(file)}. A concluded decision is being reconsidered.`}
                trailing={<Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className="text-primary">Review</Link>}
              />
            ))}
          </RowList>
        </section>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>Waiting on a decision</h2>
          <Tag tone="open">{plural(files.length, 'file')}</Tag>
        </div>
        {files.length === 0 ? (
          <EmptyNote>No file is waiting on a charging decision.</EmptyNote>
        ) : (
          <RowList>
            {files.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={`${fileReference(file)}${file.accused ? `. ${file.accused}` : ''}. Waiting ${ageLabel(file.awaitingSince).toLowerCase()}. ${plural(file.statementCount, 'statement')}, ${plural(file.chargeCount, 'proposed charge')}, ${plural(file.reviewNoteCount, 'review note')}.`}
                trailing={
                  <>
                    {file.openReviewId ? <Tag tone="open">{file.openReviewStandard === 'threshold' ? 'Threshold review under way' : 'Review under way'}</Tag> : <FileStatusTag status={file.currentStatus} />}
                    <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className="text-primary">Review</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>
    </article>
  )
}
