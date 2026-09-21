import { useHqConfig, usePermissions } from '@/features/session'
import { useWorkspace } from '@/features/workspace/tabs-store'
import { ApiError } from '@/lib/api'
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowUp01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useEffect, useRef, useState } from 'react'
import { m } from '@/paraglide/messages'
import { newTableBlock, newTextBlock } from './blocks'
import { ComposedBody } from './composed-body'
import { useDraft, useIssueDraft, useSaveDraft } from './queries'
import type { Block, Draft } from './schema'
import { TableBlockEditor } from './tables'
import { TextBlockEditor } from './text-block'

/** How long after the last change a draft saves itself. */
const AUTOSAVE_MS = 1500

/**
 * A report being composed, open as a tab. It is a document of blocks, written
 * text and tables, that the officer adds, orders and fills; it saves itself
 * shortly after each change and stays a draft until it is issued. Issuing gives
 * it a reference and freezes it, and from then on the issued report is the
 * record.
 */
export function ReportEditor({ id }: { id: string }) {
  const { data: draft, isPending, isError } = useDraft(id)
  const navigate = useNavigate()

  useEffect(() => {
    if (draft?.issuedReportId) void navigate({ to: '/reports/$report', params: { report: draft.issuedReportId }, replace: true })
  }, [draft?.issuedReportId, navigate])

  if (isPending) return null
  if (isError || !draft) return <p className="p-6">{m.reports_could_not_open()}</p>
  if (draft.issuedReportId) return null
  return <Editor key={draft.id} draft={draft} />
}

function Editor({ draft }: { draft: Draft }) {
  const { can } = usePermissions()
  const { data: hqConfig } = useHqConfig()
  const { renameTab } = useWorkspace()
  const navigate = useNavigate()
  const save = useSaveDraft(draft.id)
  const issue = useIssueDraft(draft.id)
  const editable = can('report.generate')

  const [title, setTitle] = useState(draft.title)
  const [blocks, setBlocks] = useState<Block[]>(draft.blocks)
  const [savedAt, setSavedAt] = useState<number | null>(draft.updatedAt)
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const savedJson = useRef(JSON.stringify({ title: draft.title, blocks: draft.blocks }))
  const dirty = JSON.stringify({ title, blocks }) !== savedJson.current

  useEffect(() => {
    renameTab(`report:${draft.id}`, title.trim() || m.reports_untitled())
  }, [draft.id, title, renameTab])

  const persist = async () => {
    const snapshot = JSON.stringify({ title, blocks })
    if (snapshot === savedJson.current || !title.trim()) return true
    try {
      await save.mutateAsync({ title, blocks })
      savedJson.current = snapshot
      setSavedAt(Date.now())
      return true
    } catch (error) {
      t.error(m.reports_could_not_save(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() })
      return false
    }
  }

  // Save shortly after the last change, and keep no more than one save waiting.
  useEffect(() => {
    if (!editable || !dirty || save.isPending) return
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [title, blocks, editable, dirty, save.isPending])

  const change = (blockId: string, next: Block) => setBlocks((all) => all.map((b) => (b.id === blockId ? next : b)))
  const move = (index: number, by: -1 | 1) =>
    setBlocks((all) => {
      const to = index + by
      if (to < 0 || to >= all.length) return all
      const copy = [...all]
      ;[copy[index], copy[to]] = [copy[to], copy[index]]
      return copy
    })
  const isEmpty = (block: Block) => (block.type === 'table' ? block.rows.length === 0 : block.doc.length < 80)
  const remove = (block: Block) => {
    if (!isEmpty(block) && removing !== block.id) {
      setRemoving(block.id)
      return
    }
    setRemoving(null)
    setBlocks((all) => all.filter((b) => b.id !== block.id))
  }

  const doIssue = async () => {
    if (!(await persist())) return
    issue.mutate(undefined, {
      onSuccess: (report) => void navigate({ to: '/reports/$report', params: { report: report.id } }),
      onError: (error) => t.error(m.reports_could_not_issue(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() }),
    })
  }

  const status = save.isPending ? m.reports_saving() : dirty ? m.reports_unsaved() : savedAt ? m.reports_saved({ when: formatDistanceToNowStrict(savedAt, { addSuffix: true }) }) : ''

  return (
    <article className="page [--page-max:64rem]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/reports" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
          <HugeiconsIcon icon={ArrowLeft01Icon} />
          {m.reports_all_reports()}
        </Link>
        <div className="flex items-center gap-3">
          <p aria-live="polite">{editable ? status : m.reports_read_only()}</p>
          {editable && (
            <Button disabled={blocks.length === 0 || !title.trim() || issue.isPending} onClick={() => setConfirmIssue(true)}>
              {m.reports_issue()}
            </Button>
          )}
        </div>
      </div>

      {editable ? (
        <>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={m.reports_untitled()} aria-label={m.reports_title()} className="h-10 text-lg font-semibold" />

          <div className="flex flex-col gap-4">
            {blocks.map((block, index) => (
              <section key={block.id} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4>{block.type === 'text' ? m.reports_block_text() : m.reports_block_table()}</h4>
                  <div className="flex items-center gap-1">
                    <Button size="icon-xs" variant="ghost" aria-label={m.reports_move_up()} disabled={index === 0} onClick={() => move(index, -1)}>
                      <HugeiconsIcon icon={ArrowUp01Icon} />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={m.reports_move_down()} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                      <HugeiconsIcon icon={ArrowDown01Icon} />
                    </Button>
                    <Button size="xs" variant={removing === block.id ? 'destructive' : 'ghost'} onClick={() => remove(block)} onBlur={() => setRemoving(null)}>
                      <HugeiconsIcon icon={Delete02Icon} />
                      {removing === block.id ? m.reports_remove_confirm() : m.reports_remove()}
                    </Button>
                  </div>
                </div>
                {block.type === 'text' ? (
                  <TextBlockEditor block={block} onChange={(doc) => change(block.id, { ...block, doc })} />
                ) : (
                  <TableBlockEditor block={block} headOffice={hqConfig?.isHeadOffice ?? false} onChange={(next) => change(block.id, next)} />
                )}
              </section>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBlocks((all) => [...all, newTextBlock()])}>
              {m.reports_add_text()}
            </Button>
            <Button variant="secondary" onClick={() => setBlocks((all) => [...all, newTableBlock()])}>
              {m.reports_add_table()}
            </Button>
          </div>
        </>
      ) : (
        <div className="paper mx-auto flex w-full max-w-[210mm] flex-col gap-4 p-10">
          <h1>{title}</h1>
          <ComposedBody body={{ blocks }} />
        </div>
      )}

      <Dialog open={confirmIssue} onOpenChange={setConfirmIssue}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.reports_issue_title()}</DialogTitle>
            <DialogDescription>{m.reports_issue_about()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmIssue(false)}>
              {m.reports_keep_editing()}
            </Button>
            <Button
              disabled={issue.isPending}
              onClick={() => {
                setConfirmIssue(false)
                void doIssue()
              }}
            >
              {m.reports_issue()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}
