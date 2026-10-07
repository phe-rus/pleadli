import { useCreateDraft } from '@/features/documents/queries'
import { useJurisdiction } from '@/features/installation'
import { ApiError } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Add01Icon, File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { buildContent, templateContext, templatesForDecision, type Template } from './index'

/** Makes a draft from a template for a file and opens it on the page. */
export function useMakeDocument(fileId: string) {
  const queryClient = useQueryClient()
  const create = useCreateDraft()
  const navigate = useNavigate()
  return {
    pending: create.isPending,
    make: async (template: Template, decisionId: string | null, open = true) => {
      try {
        const ctx = await templateContext(queryClient, fileId, decisionId)
        const content = buildContent(template, ctx)
        const doc = await create.mutateAsync({ prosecutionFileId: fileId, decisionId: decisionId && (template.forDecisions as readonly string[]).includes(ctx.decision?.kind ?? '') ? decisionId : null, kind: template.id, title: template.title, content })
        if (open) void navigate({ to: '/documents/$documentId', params: { documentId: doc.id } })
        return doc
      } catch (e) {
        t.error(m["doc.prepare_failed"](), { description: e instanceof ApiError || e instanceof Error ? e.message : m["common.try_again"]() })
        return null
      }
    },
  }
}

/** "New document": the country's templates, those the decision calls for
 * first. From the time limits (`custody`), the ones that stand on the file
 * alone come first: detention requests, release orders, certificates. */
export function NewDocumentButton({
  fileId,
  decisionId,
  decisionKind,
  variant = 'secondary',
  mode = 'decision',
  onMade,
  open: openProp,
  onOpenChange,
  trigger = true,
}: {
  fileId: string
  decisionId: string | null
  decisionKind: string | null
  variant?: 'default' | 'secondary' | 'ghost'
  mode?: 'decision' | 'custody'
  /** Given: the new draft is handed here instead of opening on its own page. */
  onMade?: (documentId: string) => void
  /** Given: opened from elsewhere (a menu) instead of by its own button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwnOpen(next))
  const country = useJurisdiction()
  const byDecision = templatesForDecision(country, decisionKind)
  const all = [...byDecision.primary, ...byDecision.others]
  const { primary, others } =
    mode === 'custody' ? { primary: all.filter((t) => t.forDecisions.length === 0), others: all.filter((t) => t.forDecisions.length > 0) } : byDecision
  const { make, pending } = useMakeDocument(fileId)
  const row = (tpl: Template) => (
    <li key={tpl.id}>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const doc = await make(tpl, decisionId, !onMade)
          if (doc) {
            setOpen(false)
            onMade?.(doc.id)
          }
        }}
        className="flex w-full cursor-pointer items-start gap-3 rounded-xl p-3 text-left ring-1 ring-border/60 transition-colors hover:bg-secondary/50"
      >
        <HugeiconsIcon icon={File02Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="flex flex-col">
          <strong lang={tpl.lang}>{tpl.title}</strong>
          <span className="text-sm text-muted-foreground" lang={tpl.lang}>
            {tpl.about}
          </span>
        </span>
      </button>
    </li>
  )
  return (
    <>
      {trigger && (
        <Button size={mode === 'custody' ? 'xs' : 'sm'} variant={variant} onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} />
          {mode === 'custody' ? m["doc.custody_document"]() : m["doc.new"]()}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m["doc.new_title"]()}</DialogTitle>
            <DialogDescription>{m["doc.new_lead"]({ country: country?.name.en ?? '' })}</DialogDescription>
          </DialogHeader>
          {primary.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-wide text-muted-foreground uppercase">{mode === 'custody' ? m["doc.for_custody"]() : m["doc.for_decision"]()}</h3>
              <ul className="flex list-none flex-col gap-2 p-0">{primary.map(row)}</ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs tracking-wide text-muted-foreground uppercase">{primary.length ? m["doc.other_documents"]() : m["doc.all_documents"]()}</h3>
            <ul className="flex max-h-80 list-none flex-col gap-2 overflow-y-auto p-0">{others.map(row)}</ul>
          </section>
        </DialogContent>
      </Dialog>
    </>
  )
}
