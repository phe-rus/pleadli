import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { FileStatusTag, Tag } from '@/components/status-tag'
import { ReviewStages, reviewStagesOverview } from '@/features/file-workspace/review-stages'
import { fileReference, filesOptions, useFiles } from '@/features/prosecution-files'
import { useWorkload, workloadOptions } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

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
          <h1>{m["nav.item.charging_review"]()}</h1>
          <p>{m["review_page.subtitle"]()}</p>
        </div>
      </header>

      <section className="page-section">
        <h2>{m["review_page.the_review"]()}</h2>
        <ReviewStages stages={reviewStagesOverview()} />
        <p>{m["review_page.the_review_hint"]()}</p>
      </section>

      {workload.thresholdReviews.length > 0 && (
        <section className="page-section">
          <h2>{m["review_page.threshold_reviews"]()}</h2>
          <RowList>
            {workload.thresholdReviews.map((review) => (
              <Row
                key={review.fileId}
                marker={review.dueAt < Date.now() ? 'urgent' : 'open'}
                title={review.fileTitle}
                summary={(review.dueAt < Date.now() ? m["review_page.threshold_was_due"] : m["review_page.threshold_is_due"])({ charged: formatDate(review.decidedAt), due: formatDate(review.dueAt) })}
                trailing={<Link to="/files/$fileId" params={{ fileId: review.fileId }} search={{ tab: 'decisions' }} className="text-primary">{m["common.open"]()}</Link>}
              />
            ))}
          </RowList>
        </section>
      )}

      {reopened.length > 0 && (
        <section className="page-section">
          <h2>{m["overview.figure.reopened"]()}</h2>
          <RowList>
            {reopened.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={m["review_page.reopened"]({ reference: fileReference(file) })}
                trailing={<Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className="text-primary">{m["common.review"]()}</Link>}
              />
            ))}
          </RowList>
        </section>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>{m["review_page.waiting"]()}</h2>
          <Tag tone="open">{plural(files.length, m["count.file.one"], m["count.file.many"])}</Tag>
        </div>
        {files.length === 0 ? (
          <EmptyNote>{m["review_page.empty"]()}</EmptyNote>
        ) : (
          <RowList>
            {files.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={`${fileReference(file)}${file.accused ? `. ${file.accused}` : ''}. ${m["overview.waiting"]({ age: ageLabel(file.awaitingSince).toLowerCase() })} ${plural(file.statementCount, m["count.statement.one"], m["count.statement.many"])}, ${plural(file.chargeCount, m["count.proposed_charge.one"], m["count.proposed_charge.many"])}, ${plural(file.reviewNoteCount, m["count.review_note.one"], m["count.review_note.many"])}.`}
                trailing={
                  <>
                    {file.openReviewId ? <Tag tone="open">{file.openReviewStandard === 'threshold' ? m["review_page.threshold_under_way"]() : m["review_page.under_way"]()}</Tag> : <FileStatusTag status={file.currentStatus} />}
                    <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'review' }} className="text-primary">{m["common.review"]()}</Link>
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
