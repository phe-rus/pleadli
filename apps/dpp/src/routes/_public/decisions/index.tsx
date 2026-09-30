import * as m from '@/paraglide/messages'
import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { decisionsOptions, decisionTypeLabel, useDecisions } from '@/features/decisions'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/decisions/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...decisionsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every decision recorded, newest first. Append-only: a correction is a new
 * decision that follows the old one, never an edit. */
function RouteComponent() {
  const { data: decisions } = useDecisions()

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.decisions"]()}</h1>
          <p>{m["page.decisions.about"]()}</p>
        </div>
      </header>

      {decisions.length === 0 ? (
        <EmptyNote>{m["file_ws.no_decisions"]()}</EmptyNote>
      ) : (
        <RowList>
          {decisions.map((decision) => (
            <Row
              key={decision.id}
              title={decision.fileTitle}
              summary={`${decision.fileReference ? `${decision.fileReference}. ` : ''}${formatDate(decision.decidedAt, 'datetime')}${decision.decidedBy ? `, ${decision.decidedBy}` : ''}.`}
              trailing={
                <>
                  <Tag tone="done">{decisionTypeLabel(decision.decisionType)}</Tag>
                  <Link to="/files/$fileId" params={{ fileId: decision.prosecutionFileId }} search={{ tab: 'decisions' }} className="text-primary">{m["common.open"]()}</Link>
                </>
              }
            />
          ))}
        </RowList>
      )}
    </article>
  )
}
