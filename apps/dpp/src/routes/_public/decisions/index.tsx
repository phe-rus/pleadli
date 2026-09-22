import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { decisionsOptions, decisionTypeLabel, useDecisions } from '@/features/decisions'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

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
          <h1>Decisions</h1>
          <p>The record of what was decided, by whom and when. Decisions are recorded on a file and are never edited or removed.</p>
        </div>
      </header>

      {decisions.length === 0 ? (
        <EmptyNote>No decisions recorded yet.</EmptyNote>
      ) : (
        <RowList>
          {decisions.map((decision) => (
            <Row
              key={decision.id}
              title={decision.fileTitle}
              summary={`${decision.fileReference ? `${decision.fileReference}. ` : ''}${format(decision.decidedAt, 'PPp')}${decision.decidedBy ? `, ${decision.decidedBy}` : ''}.`}
              trailing={
                <>
                  <Tag tone="done">{decisionTypeLabel(decision.decisionType)}</Tag>
                  <Link to="/files/$fileId" params={{ fileId: decision.prosecutionFileId }} search={{ tab: 'decisions' }} className="text-primary">Open</Link>
                </>
              }
            />
          ))}
        </RowList>
      )}

      <Planned title="Decisions per accused and per count" covers={['Which accused and which count a decision is about', 'The decision maker, the reasons and the previous decision it corrects', 'The document it produced and the direction sent to Police']}>
        Today a decision applies to the file as a whole.
      </Planned>
    </article>
  )
}
