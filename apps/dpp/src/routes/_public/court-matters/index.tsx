import * as m from '@/paraglide/messages'
import { formatDate } from '@/lib/dates'
import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { FileStatusTag } from '@/components/status-tag'
import { fileReference, filesOptions, useFiles } from '@/features/prosecution-files'
import { createFileRoute, Link } from '@tanstack/react-router'

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
          <h1>{m["nav.item.court_matters"]()}</h1>
          <p>{m["page.court.about"]()}</p>
        </div>
      </header>

      <section className="page-section">
        <h2>{m["page.court.without"]()}</h2>
        {withoutCase.length === 0 ? (
          <EmptyNote>{m["page.court.without_empty"]()}</EmptyNote>
        ) : (
          <RowList>
            {withoutCase.map((file) => (
              <Row
                key={file.id}
                marker="open"
                title={file.title}
                summary={m["page.court.charged_on"]({ reference: fileReference(file), date: file.lastDecisionAt ? formatDate(file.lastDecisionAt) : '' })}
                trailing={
                  <>
                    <FileStatusTag status={file.currentStatus} />
                    <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'court' }} className="text-primary">{m["common.open"]()}</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="page-section">
        <h2>{m["page.court.with"]()}</h2>
        {withCase.length === 0 ? (
          <EmptyNote>{m["page.court.with_empty"]()}</EmptyNote>
        ) : (
          <RowList>
            {withCase.map((file) => (
              <Row
                key={file.id}
                title={file.title}
                summary={m["page.court.case"]({ reference: fileReference(file), number: file.courtCaseNumber ?? '' })}
                trailing={<Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'court' }} className="text-primary">{m["common.open"]()}</Link>}
              />
            ))}
          </RowList>
        )}
      </section>

      <Planned title={m["file_ws.planned_title"]()} covers={[m["file_ws.planned_hearings"](), m["file_ws.planned_adjournments"](), m["file_ws.planned_notices"]()]}>
        {m["file_ws.planned_body"]()}
      </Planned>
    </article>
  )
}
