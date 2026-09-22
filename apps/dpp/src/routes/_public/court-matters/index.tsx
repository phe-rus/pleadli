import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { FileStatusTag } from '@/components/status-tag'
import { fileReference, filesOptions, useFiles } from '@/features/prosecution-files'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/court-matters/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...filesOptions('closed'), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** DPP's own reference copy of what has gone to court. Courts is the authority
 * and is not connected: nothing here is fetched from a court. */
function RouteComponent() {
  const { data: concluded } = useFiles('closed')
  const charged = concluded.filter((f) => f.currentStatus === 'sanctioned' || f.currentStatus === 'plea_bargained')
  const withCase = charged.filter((f) => f.courtCaseNumber)
  const withoutCase = charged.filter((f) => !f.courtCaseNumber)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Court matters</h1>
          <p>Files that were charged, and the court reference DPP holds for each. Recorded here by the prosecutor; the court's own record is the authority.</p>
        </div>
      </header>

      <section className="page-section">
        <h2>Charged, no court case number yet</h2>
        {withoutCase.length === 0 ? (
          <EmptyNote>Every charged file has a court case number, or none has been charged.</EmptyNote>
        ) : (
          <RowList>
            {withoutCase.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={`${fileReference(file)}. Charged ${file.lastDecisionAt ? format(file.lastDecisionAt, 'PP') : ''}. Record the case number once the charge sheet is filed.`}
                trailing={
                  <>
                    <FileStatusTag status={file.currentStatus} />
                    <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'court' }} className="text-primary">Open</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="page-section">
        <h2>With a court case number</h2>
        {withCase.length === 0 ? (
          <EmptyNote>No court case numbers recorded yet.</EmptyNote>
        ) : (
          <RowList>
            {withCase.map((file) => (
              <Row
                key={file.id}
                title={file.title}
                summary={`${fileReference(file)}. Court case ${file.courtCaseNumber}.`}
                trailing={<Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'court' }} className="text-primary">Open</Link>}
              />
            ))}
          </RowList>
        )}
      </section>

      <Planned title="Hearings, adjournments and notices" covers={['Trial dates and what each hearing was for', 'Adjournments, and the review after three consecutive ones', 'Notices to the prosecutor, and court-related documents']}>
        Nothing is fetched from a court and no court system is connected. These are recorded by the prosecutor once built.
      </Planned>
    </article>
  )
}
