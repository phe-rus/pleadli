import { Createpanel } from '@/components/create-panel'
import { Tag } from '@/components/status-tag'
import { documentKindLabel, documentOptions, DocumentSheet, FileForm, updateDocument, useDiscardDocument, useDocument } from '@/features/documents'
import { DocumentExport } from '@/features/export'
import { useActor } from '@/features/installation'
import { ApiError, messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextInput, RichTextPreview, richTextToPlainText } from '@pleadli/rich-text'
import { displayCode, PaperPage, PaperTabs, printSheet } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useCallback, useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/_public/documents/$documentId')({
  loader: async ({ context, params }) => {
    try {
      const document = await context.queryClient.query({ ...documentOptions(params.documentId), staleTime: 'static' })
      if (!document) throw notFound()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

type Saved = 'idle' | 'saving' | 'saved' | 'failed'

/** One document. A draft is written here: the text saves as you go (a power cut
 * loses at most the last second or two). A filed document is the sheet itself,
 * ready to print, with a check that what is stored is still what was filed. */
function RouteComponent() {
  const { documentId } = Route.useParams()
  const { data: document } = useDocument(documentId)
  const discard = useDiscardDocument()
  const navigate = useNavigate()
  const [filing, setFiling] = useState(false)
  const canFile = useActor()?.role === 'advocate'
  const [title, setTitle] = useState(document?.title ?? '')
  const bodyRef = useRef(document?.body ?? '')
  const [body, setBody] = useState(document?.body ?? '')
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetText, setSheetText] = useState('')
  useEffect(() => {
    setSheetText(sheetRef.current?.innerText ?? '')
  }, [document])
  const [saved, setSaved] = useState<Saved>('idle')
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ title })
  latest.current = { title }

  const save = useCallback(async () => {
    if (!dirty.current) return true
    dirty.current = false
    setSaved('saving')
    try {
      await updateDocument(documentId, { title: latest.current.title.trim() || m["doc_page.untitled"](), body: bodyRef.current })
      setSaved('saved')
      return true
    } catch (error) {
      dirty.current = true
      setSaved('failed')
      t.error(m["doc_page.save_failed"](), { description: messageOf(error) })
      return false
    }
  }, [documentId])

  const touch = useCallback(() => {
    dirty.current = true
    setSaved('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 1200)
  }, [save])

  // Whatever is unsaved when the page is left is saved then.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  if (!document) return null
  const draft = document.status === 'draft'

  return (
    <article className="page">
      <header className="page-header print:hidden">
        <div>
          <h1>{document.reference ?? document.title}</h1>
          <p>
            {m["doc_page.in_matter"]({ kind: documentKindLabel(document.kind) })}{' '}
            <Link to="/matters/$matterId" params={{ matterId: document.matterId }} className="text-foreground">
              {document.courtNumber ? `${document.courtNumber}, ` : ''}
              {document.matterTitle}
            </Link>
            .
          </p>
        </div>
        <div className="page-actions">
          {draft ? (
            <>
              <Tag tone="open">{m["mp.draft"]()}</Tag>
              <Tag tone="stopped">{saved === 'saving' ? m["doc_page.saving"]() : saved === 'saved' ? m["doc_page.saved"]() : saved === 'failed' ? m["doc_page.not_saved"]() : m["doc_page.saves_as_you_write"]()}</Tag>
              <DocumentExport get={() => ({ ...document, title: latest.current.title.trim() || document.title, body: bodyRef.current })} beforeExport={save} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!window.confirm(m["doc_page.discard_confirm"]())) return
                  dirty.current = false
                  clearTimeout(timer.current)
                  discard.mutate(document.id, {
                    onSuccess: () => {
                      t.success(m["doc_page.discarded"]())
                      void navigate({ to: '/documents' })
                    },
                    onError: (error) => t.error(m["doc_page.discard_failed"](), { description: messageOf(error) }),
                  })
                }}
              >
                {m["doc_page.discard"]()}
              </Button>
              {canFile ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    clearTimeout(timer.current)
                    if (await save()) setFiling(true)
                  }}
                >
                  {m["doc_page.file"]()}
                </Button>
              ) : (
                // Only an advocate files in the practice's name (Advocates Act ss.64, 66, 67);
                // the backend refuses anyone else, and the screen says so before they try.
                <Tag tone="waiting" className="whitespace-normal">
                  {m["document.advocate_files"]()}
                </Tag>
              )}
            </>
          ) : (
            <>
              {document.intact === false ? <Tag tone="urgent">{m["doc_page.changed_since_filing"]()}</Tag> : <Tag tone="done">{m["doc_page.filed_unchanged"]()}</Tag>}
              <DocumentExport get={() => document} />
              <Button size="sm" variant="secondary" onClick={() => { const el = sheetRef.current?.querySelector<HTMLElement>('[data-document-sheet]'); if (el) void printSheet(el); else window.print() }}>
                <HugeiconsIcon icon={PrinterIcon} />
                {m["doc_page.print"]()}
              </Button>
            </>
          )}
        </div>
      </header>

      {draft ? (
        <PaperPage
          entityType="document"
          entityId={document.id}
          title={title.trim() || document.title}
          head={
            <header className="mb-6 flex flex-col items-center gap-0.5 text-center">
              {document.courtNumber && <p className="font-semibold uppercase">{document.courtNumber}</p>}
              <p className="font-semibold uppercase">{document.matterTitle}</p>
            </header>
          }
          details={[
            { label: m["paper.detail.kind"](), value: documentKindLabel(document.kind) },
            { label: m["paper.detail.file"](), value: `${document.courtNumber ? `${document.courtNumber}, ` : ''}${document.matterTitle}` },
            { label: m["paper.detail.status"](), value: m["document.draft"]() },
          ]}
          events={[{ at: document.createdAt, label: m["document.drafted"]() }]}
          defaultMode={richTextToPlainText(document.body).trim() ? 'preview' : 'edit'}
          edit={
            <section aria-label="The document" className="flex flex-col gap-4">
              <Field>
                <FieldLabel>{m["doc_page.title"]()}</FieldLabel>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    latest.current = { ...latest.current, title: e.target.value }
                    touch()
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>{m["doc_page.text"]()}</FieldLabel>
                <RichTextInput
                  value={body}
                  editorClassName="min-h-[28rem] max-h-[60vh]"
                  placeholder={m["doc_page.placeholder"]()}
                  onChange={(json) => {
                    bodyRef.current = richTextToPlainText(json).trim() ? json : ''
                    setBody(bodyRef.current)
                    touch()
                  }}
                />
              </Field>
            </section>
          }
        >
          <RichTextPreview value={body} />
        </PaperPage>
      ) : (
        <>
          <div className="print:hidden">
            <PaperTabs
              entityType="document"
              entityId={document.id}
              wording={sheetText}
              details={[
                ...(document.reference ? [{ label: m["paper.detail.reference"](), value: document.reference, copy: document.reference }] : []),
                { label: m["paper.detail.kind"](), value: documentKindLabel(document.kind) },
                { label: m["paper.detail.file"](), value: `${document.courtNumber ? `${document.courtNumber}, ` : ''}${document.matterTitle}` },
                { label: m["document.filed_label"](), value: `${document.filedOn ? format(document.filedOn, 'PP') : '·'}${document.filedBy ? `, ${document.filedBy}` : ''}${document.filedWith ? `, ${document.filedWith}` : ''}` },
                ...(document.content?.verifyCode ? [{ label: m["paper.verify_line"](), value: displayCode(document.content.verifyCode), copy: displayCode(document.content.verifyCode) }] : []),
                { label: m["document.sha_label"](), value: <span className="break-all font-mono text-xs">{document.contentSha256}</span> },
              ]}
              events={[
                { at: document.createdAt, label: m["document.drafted"]() },
                ...(document.filedAt ? [{ at: document.filedAt, label: `${m["document.filed_label"]()} ${document.reference ?? ''}`, by: document.filedBy }] : []),
              ]}
            />
          </div>
          <div ref={sheetRef}>
            <DocumentSheet document={document} />
          </div>
        </>
      )}

      <Createpanel open={filing} onOpenChange={setFiling} headings={{ title: m["doc_page.file_title"](), description: m["doc_page.file_description"]() }}>
        <FileForm document={document} onSuccess={() => setFiling(false)} />
      </Createpanel>
    </article>
  )
}
