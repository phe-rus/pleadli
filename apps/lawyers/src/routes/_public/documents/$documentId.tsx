import { Createpanel } from '@/components/create-panel'
import { Tag } from '@/components/status-tag'
import { documentKindLabel, documentOptions, DocumentSheet, FileForm, updateDocument, useDiscardDocument, useDocument } from '@/features/documents'
import { ApiError, messageOf } from '@/lib/api'
import { PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextInput, richTextToPlainText } from '@pleadli/rich-text'
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
  const [title, setTitle] = useState(document?.title ?? '')
  const bodyRef = useRef(document?.body ?? '')
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
      await updateDocument(documentId, { title: latest.current.title.trim() || 'Untitled', body: bodyRef.current })
      setSaved('saved')
      return true
    } catch (error) {
      dirty.current = true
      setSaved('failed')
      t.error('The draft could not be saved', { description: messageOf(error) })
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
            {documentKindLabel(document.kind)} in{' '}
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
              <Tag tone="open">Draft</Tag>
              <Tag tone="stopped">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'failed' ? 'Not saved' : 'Saves as you write'}</Tag>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!window.confirm('Discard this draft?')) return
                  dirty.current = false
                  clearTimeout(timer.current)
                  discard.mutate(document.id, {
                    onSuccess: () => {
                      t.success('Draft discarded')
                      void navigate({ to: '/documents' })
                    },
                    onError: (error) => t.error('Could not discard the draft', { description: messageOf(error) }),
                  })
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  clearTimeout(timer.current)
                  if (await save()) setFiling(true)
                }}
              >
                File
              </Button>
            </>
          ) : (
            <>
              {document.intact === false ? <Tag tone="urgent">Changed since filing</Tag> : <Tag tone="done">Filed, unchanged</Tag>}
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <HugeiconsIcon icon={PrinterIcon} />
                Print
              </Button>
            </>
          )}
        </div>
      </header>

      {draft ? (
        <div className="grid grid-cols-1 gap-8">
          <section aria-label="The document" className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Title</FieldLabel>
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
              <FieldLabel>Text</FieldLabel>
              <RichTextInput
                value={document.body}
                editorClassName="min-h-[28rem] max-h-[60vh]"
                placeholder="Write the document. Headings and lists are in the toolbar."
                onChange={(json) => {
                  bodyRef.current = richTextToPlainText(json).trim() ? json : ''
                  touch()
                }}
              />
            </Field>
          </section>
        </div>
      ) : (
        <>
          <DocumentSheet document={document} />
          <section className="page-section print:hidden">
            <h2>Record</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Filed</dt>
                <dd>
                  {document.filedOn ? format(document.filedOn, 'PP') : '·'} by {document.filedBy ?? '·'}
                  {document.filedWith ? `, with ${document.filedWith}` : ''}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">SHA-256 of the text as filed</dt>
                <dd className="break-all">{document.contentSha256}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <Createpanel open={filing} onOpenChange={setFiling} headings={{ title: 'File the document', description: 'Give the day it was filed, and with whom.' }}>
        <FileForm document={document} onSuccess={() => setFiling(false)} />
      </Createpanel>
    </article>
  )
}
