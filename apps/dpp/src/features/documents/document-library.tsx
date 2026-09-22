import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { decisionActs, decisionTypeLabel, useDecisions } from '@/features/decisions'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useDocuments } from './queries'
import { PrepareDocumentButton } from './prepare-button'
import { decisionDocumentKind, documentKindLabel, type DocumentRecord } from './schema'

/** The documents of one file, or of the whole installation: what has been
 * prepared (drafts and issued), and what a decision could produce that has not
 * been prepared yet. */
export function DocumentLibrary({ fileId }: { fileId?: string }) {
  const { data: documents } = useDocuments(fileId)
  const { data: allDecisions } = useDecisions()
  const decisions = fileId ? allDecisions.filter((d) => d.prosecutionFileId === fileId) : allDecisions

  const ready = decisionActs(decisions.filter((d) => decisionDocumentKind(d.decisionType)))
    .map((act) => ({ ...act, kind: decisionDocumentKind(act.decisions[0].decisionType)! }))
    .filter((act) => !documents.some((doc) => doc.kind === act.kind && act.decisions.some((d) => d.id === doc.sourceDecisionId)))

  return (
    <div className="flex flex-col gap-8">
      <section className="page-section">
        <h2>Documents</h2>
        {documents.length === 0 ? (
          <EmptyNote>None prepared yet.</EmptyNote>
        ) : (
          <RowList>
            {documents.map((doc: DocumentRecord) => (
              <Row
                key={doc.id}
                title={
                  <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="text-foreground no-underline hover:underline">
                    {doc.title}
                  </Link>
                }
                summary={`${doc.reference ? `${doc.reference}. ` : ''}${doc.fileTitle}${doc.fileReference ? `, ${doc.fileReference}` : ''}. ${doc.status === 'issued' ? `Issued ${format(doc.issuedAt ?? doc.preparedAt, 'PP')}` : `Prepared ${format(doc.preparedAt, 'PP')}`}.`}
                trailing={
                  <>
                    {doc.integrity === 'altered' && <Tag tone="urgent">Altered</Tag>}
                    <Tag tone={doc.status === 'issued' ? 'done' : 'open'}>{doc.status === 'issued' ? 'Issued' : 'Draft'}</Tag>
                    <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="text-primary">
                      Read
                    </Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="page-section">
        <h2>Ready to prepare</h2>
        {ready.length === 0 ? (
          <EmptyNote>Every decision that produces a document has one prepared.</EmptyNote>
        ) : (
          <RowList>
            {ready.map((act) => (
              <Row
                key={act.key}
                aligned
                title={documentKindLabel(act.kind)}
                summary={`From the decision to ${decisionTypeLabel(act.decisions[0].decisionType).toLowerCase()}, ${format(act.decisions[0].decidedAt, 'PP')}${'fileTitle' in act.decisions[0] ? `. ${(act.decisions[0] as { fileTitle: string }).fileTitle}` : ''}.`}
                trailing={<PrepareDocumentButton decisionId={act.decisions[0].id} />}
              />
            ))}
          </RowList>
        )}
      </section>
    </div>
  )
}

/** For a decision that produces a document: open it if prepared, else prepare it. */
export function DecisionDocumentAction({ actDecisionIds, documents, kind }: { actDecisionIds: string[]; documents: DocumentRecord[]; kind: string }) {
  const doc = documents.find((d) => d.kind === kind && actDecisionIds.includes(d.sourceDecisionId))
  if (doc) {
    return (
      <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="text-primary">
        Open {documentKindLabel(kind).toLowerCase()}
      </Link>
    )
  }
  return <PrepareDocumentButton decisionId={actDecisionIds[0]} label={`Prepare ${documentKindLabel(kind).toLowerCase()}`} />
}

export { Planned }
