import { Tag } from '@/components/status-tag'
import { decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { ApiError } from '@/lib/api'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { saveExport } from './data'
import { DocumentSheet } from './document-sheet'
import { useDiscardDocument, useDocument, useDocuments, useIssueDocument, useRefreshDocument } from './queries'
import { exportFormats } from './schema'

const say = (error: unknown) => (error instanceof ApiError ? error.message : 'Please try again.')

/** A document, read first and acted on second. The reading surface is the
 * sheet; everything around it (who and what it is, where it came from, what can
 * be done with it) is set apart and does not print. */
export function DocumentReader({ id }: { id: string }) {
  const { data: doc } = useDocument(id)
  const { data: all } = useDocuments()
  const { data: decisions } = useDecisionsForFile(doc.prosecutionFileId)
  const navigate = useNavigate()
  const refresh = useRefreshDocument()
  const issue = useIssueDocument()
  const discard = useDiscardDocument()

  const source = decisions.find((d) => d.id === doc.sourceDecisionId)
  const index = all.findIndex((d) => d.id === doc.id)
  const previous = index > 0 ? all[index - 1] : null
  const next = index >= 0 && index < all.length - 1 ? all[index + 1] : null
  const draft = doc.status === 'draft'

  const download = (format: 'docx' | 'md') =>
    saveExport(doc.id, format).then(
      (saved) => saved && t.success('Saved'),
      (error) => t.error('Could not save the file', { description: say(error) }),
    )

  return (
    <article className="page">
      <div className="flex flex-col gap-6 print:hidden">
        <header className="page-header">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1>{doc.title}</h1>
              <Tag tone={draft ? 'open' : 'done'}>{draft ? 'Draft' : 'Issued'}</Tag>
              {doc.integrity === 'altered' && <Tag tone="urgent">Stored content has changed since it was issued</Tag>}
            </div>
            <p>
              {doc.reference ? `${doc.reference}. ` : 'Not yet issued. '}
              <Link to="/files/$fileId" params={{ fileId: doc.prosecutionFileId }} className="text-foreground">
                {doc.fileTitle}
              </Link>
              {doc.fileReference ? `, ${doc.fileReference}` : ''}
            </p>
          </div>
          <div className="page-actions">
            <Button size="sm" variant="ghost" disabled={!previous} aria-label="Previous document" onClick={() => previous && void navigate({ to: '/documents/$documentId', params: { documentId: previous.id } })}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
            <Button size="sm" variant="ghost" disabled={!next} aria-label="Next document" onClick={() => next && void navigate({ to: '/documents/$documentId', params: { documentId: next.id } })}>
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Document actions">
          <Button size="sm" variant="default" onClick={() => window.print()}>
            Print
          </Button>
          <Button
            size="sm"
            variant="secondary"
            title="Opens the print dialog. Choose Save as PDF as the printer."
            onClick={() => {
              t.success('Choose "Save as PDF" as the printer')
              window.print()
            }}
          >
            Save as PDF
          </Button>
          {exportFormats.map((f) => (
            <Button key={f.id} size="sm" variant="secondary" onClick={() => void download(f.id)}>
              {f.label}
            </Button>
          ))}
          {draft && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(doc.id, { onError: (e) => t.error('Could not refresh', { description: say(e) }) })}>
                Refresh from the record
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={issue.isPending}
                onClick={() => {
                  if (window.confirm('Issue this document? It is given its reference and can no longer be changed.')) {
                    issue.mutate(doc.id, { onSuccess: () => t.success('Document issued'), onError: (e) => t.error('Could not issue', { description: say(e) }) })
                  }
                }}
              >
                Issue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm('Discard this draft? The decision it came from is not affected.')) {
                    discard.mutate(doc.id, { onSuccess: () => void navigate({ to: '/documents' }), onError: (e) => t.error('Could not discard', { description: say(e) }) })
                  }
                }}
              >
                Discard draft
              </Button>
            </>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">Prepared from</dt>
            <dd>{source ? `${decisionTypeLabel(source.decisionType)}, ${format(source.decidedAt, 'PP')}` : 'A decision on this file'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{draft ? 'Last prepared' : 'Issued'}</dt>
            <dd>{format(draft ? doc.preparedAt : (doc.issuedAt ?? doc.preparedAt), 'PPp')}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">Author</dt>
            <dd>{doc.author ?? 'Set when issued'}</dd>
          </div>
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted-foreground">SHA-256 of the issued content</dt>
            <dd className="truncate font-mono text-xs" title={doc.contentSha256 ?? undefined}>{doc.contentSha256 ?? 'Taken when issued'}</dd>
          </div>
        </dl>
        {draft && <p>A draft follows the record when refreshed. Once issued, the content is frozen with its reference and cannot be changed.</p>}
      </div>

      <DocumentSheet document={doc} />
    </article>
  )
}
