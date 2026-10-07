import { PaperTabs, printSheet, SignaturePad, type PaperLink } from '@pleadli/paper'
import { Segmented } from '@pleadli/ui/segmented'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { formatDate } from '@/lib/dates'
import { Tag } from '@/components/status-tag'
import { decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { ApiError } from '@/lib/api'
import { ArrowLeft01Icon, ArrowRight01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Link, useNavigate } from '@tanstack/react-router'
import { saveExport } from './data'
import { DocumentSheet } from './document-sheet'
import { useDiscardDocument, useDocument, useDocuments, useIssueDocument, useRefreshDocument, useSaveContent, useSeals, useSetSignature } from './queries'
import { useSecurityStatus } from '@/features/security'
import { Checkbox } from '@pleadli/ui/checkbox'
import type { DocumentContent } from './schema'
import { assistContext } from '@/features/assist/context'
import { api } from '@/lib/api'
import { serviceNames } from '@/lib/jurisdiction'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

/**
 * The signatures a person may put on a paper: the one saved in Settings, and
 * the ones they themselves used on documents they issued. Never anyone
 * else's. Or a new one, drawn here, which can be kept as theirs.
 */
function SignSheet({ open, onOpenChange, onSign }: { open: boolean; onOpenChange: (open: boolean) => void; onSign: (png: string) => void }) {
  const { data: seals } = useSeals()
  const { data: status } = useSecurityStatus()
  const { data: all } = useDocuments()
  const setSaved = useSetSignature()
  const [drawing, setDrawing] = useState(false)
  const [keep, setKeep] = useState(false)
  const me = status?.actor?.name
  const used = [...new Set(all.filter((d) => d.status === 'issued' && me && d.author === me && d.content.signatureImage).map((d) => d.content.signatureImage!))].filter((sig) => sig !== seals?.signature).slice(0, 3)
  const mine = [...(seals?.signature ? [{ image: seals.signature, label: m["doc.sign_saved"]() }] : []), ...used.map((image) => ({ image, label: m["doc.sign_used_before"]() }))]
  const showPad = drawing || mine.length === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setDrawing(false)
          setKeep(false)
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m["doc.sign_title"]()}</DialogTitle>
          <DialogDescription>{m["doc.sign_lead"]()}</DialogDescription>
        </DialogHeader>
        {!showPad ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {mine.map((sig, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSign(sig.image)}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-border/70 transition-shadow hover:shadow-sm hover:ring-primary/50"
                >
                  <img src={sig.image} alt="" className="h-16 w-full object-contain" />
                  <span className="text-xs text-muted-foreground">{sig.label}</span>
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setDrawing(true)}>
              {m["doc.sign_draw_new"]()}
            </Button>
          </div>
        ) : (
          <>
            <SignaturePad
              labels={{ hint: m["seal.pad_hint"](), clear: m["seal.pad_clear"](), done: m["doc.sign_done"](), cancel: m["common.cancel"]() }}
              onCancel={() => (mine.length ? setDrawing(false) : onOpenChange(false))}
              onDone={(png) => {
                if (keep) setSaved.mutate(png)
                onSign(png)
              }}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={keep} onCheckedChange={(v) => setKeep(v === true)} />
              {m["doc.sign_keep"]()}
            </label>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A document, read first and acted on second. The reading surface is the
 * sheet; everything around it (who and what it is, where it came from, what can
 * be done with it) is set apart and does not print. */
export function DocumentReader({ id, embedded = false, links }: { id: string; embedded?: boolean; links?: { related?: PaperLink[]; citedBy?: PaperLink[] } }) {
  const { data: doc } = useDocument(id)
  const { data: all } = useDocuments()
  const { data: decisions } = useDecisionsForFile(doc.prosecutionFileId)
  const navigate = useNavigate()
  const refresh = useRefreshDocument()
  const issue = useIssueDocument()
  const discard = useDiscardDocument()
  const save = useSaveContent()
  const queryClient = useQueryClient()
  // Read it, change its words, or write on it with a pen: one control, three ways of working on the page.
  const [mode, setMode] = useState<'preview' | 'edit' | 'write'>('preview')
  const editing = mode === 'edit'
  const [signing, setSigning] = useState(false)
  const [discarding, setDiscarding] = useState(false)
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
      const ask = `Write the paragraph of "${doc.content.title}" that comes after:\n${before}\n\nWhat is there now: ${'text' in current ? current.text : ''}\n\nWrite it in ${doc.content.lang === 'fr' ? 'French' : doc.content.lang === 'sw' ? 'Swahili' : 'English'}, in the formal style of this document, from the facts of the file only. Reply with the paragraph text alone.`
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

  const sheetRef = useRef<HTMLDivElement>(null)
  const [wording, setWording] = useState('')
  useEffect(() => {
    setWording(sheetRef.current?.innerText ?? '')
  }, [doc])
  const printThis = () => {
    const sheet = sheetRef.current?.querySelector<HTMLElement>('[data-document-sheet]')
    if (sheet) void printSheet(sheet)
    else window.print()
  }

  const download = (format: 'docx' | 'md') =>
    saveExport(doc.id, format).then(
      (saved) => saved && t.success(m["doc.saved"]()),
      (error) => t.error(m["doc.save_failed"](), { description: say(error) }),
    )

  return (
    <article className={embedded ? 'flex flex-col gap-4' : 'page'}>
      <div className="flex flex-col gap-6 print:hidden">
        {!embedded && (
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
        )}

        <div className="flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label={m["doc.actions"]()}>
          {draft ? (
            <Segmented
              label={m["doc.actions"]()}
              value={mode}
              onChange={setMode}
              items={[
                { value: 'preview', label: m["paper.preview"]() },
                { value: 'edit', label: m["paper.edit"]() },
                { value: 'write', label: m["doc.write"]() },
              ]}
            />
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {draft && (
              <Button size="sm" variant="ghost" onClick={() => setSigning(true)}>
                {m["doc.sign"]()}
              </Button>
            )}
            {!draft && (
              <Button size="sm" variant="ghost" onClick={() => void download('docx')}>
                {m["paper.word"]()}
              </Button>
            )}
            <Button size="sm" variant={draft ? 'secondary' : 'default'} onClick={printThis} title={m["doc.pdf_hint"]()}>
              {m["paper.print"]()}
            </Button>
            {draft && (
              <Button size="sm" onClick={() => setConfirmIssue(true)}>
                {m["doc.issue"]()}
              </Button>
            )}
            {draft && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="icon-sm" variant="ghost" aria-label={m["doc.more"]()} title={m["doc.more"]()}>
                      <HugeiconsIcon icon={MoreHorizontalIcon} />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => void download('docx')}>{m["paper.word"]()}</DropdownMenuItem>
                  {!fromTemplate && (
                    <DropdownMenuItem onClick={() => refresh.mutate(doc.id, { onError: (e) => t.error(m["doc.refresh_failed"](), { description: say(e) }) })}>{m["doc.refresh"]()}</DropdownMenuItem>
                  )}
                  {doc.content.ink && <DropdownMenuItem onClick={() => change({ ...doc.content, ink: undefined })}>{m["doc.clear_writing"]()}</DropdownMenuItem>}
                  {doc.content.signatureImage && <DropdownMenuItem onClick={() => change({ ...doc.content, signatureImage: undefined })}>{m["doc.remove_signature"]()}</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDiscarding(true)}>
                    {m["doc.discard"]()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {mode === 'write' && <p className="text-sm text-muted-foreground">{m["doc.write_hint"]()}</p>}

        {/* Issuing makes the paper final: asked once, plainly, in a sheet. */}
        <Dialog open={confirmIssue} onOpenChange={setConfirmIssue}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{m["doc.issue_title"]({ title: doc.title })}</DialogTitle>
              <DialogDescription>{m["doc.issue_sure"]()}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmIssue(false)}>
                {m["common.cancel"]()}
              </Button>
              <Button
                disabled={issue.isPending}
                onClick={() =>
                  issue.mutate(
                    { id: doc.id, prefix: serviceNames().short.replace(/[^A-Za-z0-9]/g, '').toUpperCase() },
                    {
                      onSuccess: () => {
                        setConfirmIssue(false)
                        setMode('preview')
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
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={discarding} onOpenChange={setDiscarding}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{m["doc.discard"]()}</DialogTitle>
              <DialogDescription>{m["doc.discard_confirm"]()}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDiscarding(false)}>
                {m["common.cancel"]()}
              </Button>
              <Button
                variant="destructive"
                disabled={discard.isPending}
                onClick={() =>
                  discard.mutate(doc.id, {
                    onSuccess: () => {
                      setDiscarding(false)
                      if (!embedded) void navigate({ to: '/documents' })
                    },
                    onError: (e) => t.error(m["doc.discard_failed"](), { description: say(e) }),
                  })
                }
              >
                {m["doc.discard"]()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Signing on the paper itself: a signature already yours, or a new one drawn with a pen, a finger or the mouse. */}
        <SignSheet
          open={signing}
          onOpenChange={setSigning}
          onSign={(png) => {
            setSigning(false)
            change({ ...doc.content, signatureImage: png })
          }}
        />

        <PaperTabs
          entityType="document"
          entityId={doc.id}
          wording={wording}
          related={links?.related}
          citedBy={links?.citedBy}
          events={[
            { at: doc.preparedAt, label: source ? `${m["doc.prepared_from"]()} ${decisionTypeLabel(source.decisionType)}` : m["doc.from_template"]() },
            ...(doc.issuedAt ? [{ at: doc.issuedAt, label: `${m["doc.issued"]()} ${doc.reference ?? ''}`, by: doc.author }] : []),
          ]}
          details={[
            { label: m["paper.detail.reference"](), value: doc.reference ?? m["doc.not_issued"](), copy: doc.reference ?? undefined },
            { label: m["paper.detail.file"](), value: `${doc.fileTitle}${doc.fileReference ? `, ${doc.fileReference}` : ''}` },
            { label: m["paper.detail.status"](), value: draft ? m["doc.draft"]() : m["doc.issued"]() },
            { label: m["doc.prepared_from"](), value: source ? `${decisionTypeLabel(source.decisionType)}, ${formatDate(source.decidedAt)}` : m["doc.from_template"]() },
            { label: draft ? m["doc.last_prepared"]() : m["doc.issued"](), value: formatDate(draft ? doc.preparedAt : (doc.issuedAt ?? doc.preparedAt), 'datetime') },
            { label: m["doc.author"](), value: doc.author ?? m["doc.set_when_issued"]() },
            ...(doc.content.verifyCode ? [{ label: m["paper.verify_line"](), value: doc.content.verifyCode, copy: doc.content.verifyCode }] : []),
          ]}
        />
        {draft && <p className="text-sm text-muted-foreground">{fromTemplate ? m["doc.draft_hint_template"]() : m["doc.draft_hint"]()}</p>}
      </div>

      <div ref={sheetRef}>
        <DocumentSheet document={doc} editing={draft && editing} writing={draft && mode === 'write'} onChange={change} onAssist={(i) => void assist(i)} assisting={assisting} />
      </div>
    </article>
  )
}
