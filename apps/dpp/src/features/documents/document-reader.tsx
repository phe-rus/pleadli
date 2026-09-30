import { formatDate } from '@/lib/dates'
import { Tag } from '@/components/status-tag'
import { decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { ApiError } from '@/lib/api'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Link, useNavigate } from '@tanstack/react-router'
import { saveExport } from './data'
import { DocumentSheet } from './document-sheet'
import { useDiscardDocument, useDocument, useDocuments, useIssueDocument, useRefreshDocument, useSaveContent } from './queries'
import type { DocumentContent } from './schema'
import { assistContext } from '@/features/assist/context'
import { api } from '@/lib/api'
import { serviceNames } from '@/lib/jurisdiction'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { exportFormats } from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

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
  const save = useSaveContent()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [assisting, setAssisting] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fromTemplate = Boolean(doc.content.lang)

  // Every change on the page is kept, a moment after typing stops.
  const change = (content: DocumentContent) => {
    queryClient.setQueryData(['documents', 'detail', doc.id], { ...doc, title: content.title, content })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save.mutate({ id: doc.id, title: content.title, content }, { onError: (e) => t.error(m["doc.save_failed"](), { description: say(e) }) }), 700)
  }

  // Assist writes one paragraph in the document's own language, from the file.
  const assist = async (index: number) => {
    setAssisting(index)
    try {
      const before = doc.content.blocks.slice(Math.max(0, index - 3), index).map((b) => ('text' in b ? b.text : '')).join('\n')
      const current = doc.content.blocks[index]
      const ask = `Write the paragraph of "${doc.content.title}" that comes after:\n${before}\n\nWhat is there now: ${'text' in current ? current.text : ''}\n\nWrite it in ${doc.content.lang === 'fr' ? 'French' : doc.content.lang === 'sw' ? 'Swahili' : doc.content.lang === 'de' ? 'German' : 'English'}, in the formal style of this document, from the facts of the file only. Reply with the paragraph text alone.`
      const reply = await api('POST', '/api/assist/chat', { body: { messages: [{ role: 'user', content: ask }], fileId: doc.prosecutionFileId, place: 'a document being drafted', context: assistContext(doc.prosecutionFileId) } })
      const text = String((reply as { text?: string }).text ?? '').trim()
      if (text) change({ ...doc.content, blocks: doc.content.blocks.map((b, i) => (i === index && b.type === 'paragraph' ? { ...b, text } : b)) })
    } catch (e) {
      t.error(m["doc.assist_failed"](), { description: say(e) })
    } finally {
      setAssisting(null)
    }
  }

  const source = decisions.find((d) => d.id === doc.sourceDecisionId)
  const index = all.findIndex((d) => d.id === doc.id)
  const previous = index > 0 ? all[index - 1] : null
  const next = index >= 0 && index < all.length - 1 ? all[index + 1] : null
  const draft = doc.status === 'draft'

  const download = (format: 'docx' | 'md') =>
    saveExport(doc.id, format).then(
      (saved) => saved && t.success(m["doc.saved"]()),
      (error) => t.error(m["doc.save_failed"](), { description: say(error) }),
    )

  return (
    <article className="page">
      <div className="flex flex-col gap-6 print:hidden">
        <header className="page-header">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1>{doc.title}</h1>
              <Tag tone={draft ? 'open' : 'done'}>{draft ? m["doc.draft"]() : m["doc.issued"]()}</Tag>
              {doc.integrity === 'altered' && <Tag tone="urgent">{m["doc.altered_long"]()}</Tag>}
            </div>
            <p>
              {doc.reference ? `${doc.reference}. ` : `${m["doc.not_issued"]()} `}
              <Link to="/files/$fileId" params={{ fileId: doc.prosecutionFileId }} className="text-foreground">
                {doc.fileTitle}
              </Link>
              {doc.fileReference ? `, ${doc.fileReference}` : ''}
            </p>
          </div>
          <div className="page-actions">
            <Button size="sm" variant="ghost" disabled={!previous} aria-label={m["doc.previous"]()} onClick={() => previous && void navigate({ to: '/documents/$documentId', params: { documentId: previous.id } })}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
            <Button size="sm" variant="ghost" disabled={!next} aria-label={m["doc.next"]()} onClick={() => next && void navigate({ to: '/documents/$documentId', params: { documentId: next.id } })}>
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={m["doc.actions"]()}>
          <Button size="sm" variant="default" onClick={() => window.print()}>
            {m["doc.print"]()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            title={m["doc.pdf_hint"]()}
            onClick={() => {
              t.success(m["doc.pdf_toast"]())
              window.print()
            }}
          >
            {m["doc.save_pdf"]()}
          </Button>
          {exportFormats.map((f) => (
            <Button key={f.id} size="sm" variant="secondary" onClick={() => void download(f.id)}>
              {f.label()}
            </Button>
          ))}
          {draft && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <Button size="sm" variant={editing ? 'default' : 'outline'} onClick={() => setEditing((e) => !e)}>
                {editing ? m["doc.done_editing"]() : m["doc.edit"]()}
              </Button>
              {!fromTemplate && (
                <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(doc.id, { onError: (e) => t.error(m["doc.refresh_failed"](), { description: say(e) }) })}>
                  {m["doc.refresh"]()}
                </Button>
              )}
              {confirmIssue ? (
                <span className="flex items-center gap-2 rounded-lg bg-primary/5 px-2 py-1 ring-1 ring-primary/30">
                  <span className="text-sm">{m["doc.issue_sure"]()}</span>
                  <Button
                    size="sm"
                    disabled={issue.isPending}
                    onClick={() =>
                      issue.mutate(
                        { id: doc.id, prefix: serviceNames().short.replace(/[^A-Za-z0-9]/g, '').toUpperCase() },
                        {
                          onSuccess: () => {
                            setConfirmIssue(false)
                            setEditing(false)
                            t.success(m["security.audit_action.document_issued"]())
                            void queryClient.invalidateQueries({ queryKey: ['documents'] })
                          },
                          onError: (e) => t.error(m["doc.issue_failed"](), { description: say(e) }),
                        },
                      )
                    }
                  >
                    {m["doc.issue_now"]()}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmIssue(false)}>
                    {m["common.cancel"]()}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmIssue(true)}>
                  {m["doc.issue"]()}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(m["doc.discard_confirm"]())) {
                    discard.mutate(doc.id, { onSuccess: () => void navigate({ to: '/documents' }), onError: (e) => t.error(m["doc.discard_failed"](), { description: say(e) }) })
                  }
                }}
              >
                {m["doc.discard"]()}
              </Button>
            </>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{m["doc.prepared_from"]()}</dt>
            <dd>{source ? `${decisionTypeLabel(source.decisionType)}, ${formatDate(source.decidedAt)}` : m["doc.from_template"]()}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{draft ? m["doc.last_prepared"]() : m["doc.issued"]()}</dt>
            <dd>{formatDate(draft ? doc.preparedAt : (doc.issuedAt ?? doc.preparedAt), 'datetime')}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{m["doc.author"]()}</dt>
            <dd>{doc.author ?? m["doc.set_when_issued"]()}</dd>
          </div>
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted-foreground">{m["doc.sha"]()}</dt>
            <dd className="truncate font-mono text-xs" title={doc.contentSha256 ?? undefined}>{doc.contentSha256 ?? m["doc.taken_when_issued"]()}</dd>
          </div>
        </dl>
        {draft && <p>{fromTemplate ? m["doc.draft_hint_template"]() : m["doc.draft_hint"]()}</p>}
      </div>

      <DocumentSheet document={doc} editing={draft && editing} onChange={change} onAssist={(i) => void assist(i)} assisting={assisting} />
    </article>
  )
}
