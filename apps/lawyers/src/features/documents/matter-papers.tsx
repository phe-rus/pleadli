import { PanelButton } from '@/components/add-panel'
import { Tag } from '@/components/status-tag'
import { GivePapers } from './give'
import { DocumentExport } from '@/features/export/document-export'
import { installationOptions } from '@/features/installation'
import { LETTERS, templatesNeeded, type Template } from '@/features/templates'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Add01Icon, File02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperSheet, SheetActions } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useRef, useState } from 'react'
import { useTemplateContext } from './document-forms'
import { DocumentSheet } from './document-sheet'
import { documentOptions, useCreateDocument } from './queries'
import { documentKindLabel, type DocumentSummary } from './schema'

/** The practice's letterhead on a draft: its name, then address, phone and email. */
export function Letterhead() {
  const { data: install } = useQuery(installationOptions())
  if (!install?.officeName) return null
  const contacts = [install.address, install.phone, install.email].filter(Boolean).join(' · ')
  return (
    <header className="mb-6 border-b border-current pb-3 text-center">
      <p className="font-semibold tracking-wide uppercase">{install.officeName}</p>
      {contacts && <p className="text-xs">{contacts}</p>}
    </header>
  )
}

/**
 * A matter's papers, first on its page: what to prepare next (the papers this
 * kind of matter needs at its stage, then every other template), the papers
 * already made, and the chosen one as its page with everything that gets it
 * out: print or PDF, Word, open in Word.
 */
export function MatterPapers({ matterId, matterType, stage, documents, open, matterTitle, clientName }: { matterId: string; matterType: string; stage: string; documents: DocumentSummary[]; open: boolean; matterTitle: string; clientName: string }) {
  const queryClient = useQueryClient()
  const create = useCreateDocument()
  const { offered, context } = useTemplateContext(matterId)
  const needed = templatesNeeded(offered, matterType, stage)
  const others = offered.filter((tpl) => !needed.includes(tpl) && tpl.id !== 'blank')
  const [chosen, setChosen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const current = documents.find((d) => d.id === chosen) ?? documents[0]
  const { data: document } = useQuery({ ...documentOptions(current?.id ?? ''), enabled: !!current })
  const sheet = useRef<HTMLDivElement>(null)

  const prepare = async (tpl: Template) => {
    const ctx = context()
    try {
      const made = await create.mutateAsync({ matterId, kind: tpl.kind, title: tpl.title(ctx), body: tpl.body(ctx) || undefined })
      await queryClient.invalidateQueries({ queryKey: ['matters', 'detail', matterId] })
      setChosen(made.id)
      t.success(m["document.form.started"]())
    } catch (error) {
      t.error(m["document.form.start_failed"](), { description: messageOf(error) })
    }
  }

  const templateButton = (tpl: Template) => (
    <button
      key={tpl.id}
      type="button"
      disabled={!open || create.isPending}
      onClick={() => void prepare(tpl)}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60 disabled:cursor-default disabled:opacity-50"
    >
      <HugeiconsIcon icon={Add01Icon} className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">{tpl.label()}</span>
    </button>
  )

  return (
    <section aria-labelledby="papers-of-matter" className="page-section">
      <div className="section-head">
        <h2 id="papers-of-matter">{m["mp.papers"]()}</h2>
        {documents.length > 0 && (
          <PanelButton label={m["give.button"]()} title={m["give.title"]()} description={m["give.description"]()} variant="secondary" icon={false}>
            {({ close }) => <GivePapers matterId={matterId} matterTitle={matterTitle} clientName={clientName} documents={documents} onDone={close} />}
          </PanelButton>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-4">
          {open && (
            <div className="flex flex-col gap-0.5 rounded-xl bg-secondary/40 p-2">
              <h3 className="px-2 pt-1 text-xs font-medium text-muted-foreground">{m["mp.prepare_now"]()}</h3>
              {needed.map(templateButton)}
              <button type="button" onClick={() => setShowAll((s) => !s)} className="cursor-pointer px-2 py-1 text-left text-xs text-primary">
                {showAll ? m["mp.fewer"]() : m["mp.all_templates"]({ count: String(others.length) })}
              </button>
              {showAll && others.map(templateButton)}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["mp.made"]()}</h3>
            {documents.length === 0 && <p className="px-2 text-sm text-muted-foreground">{m["mp.no_documents"]()}</p>}
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setChosen(d.id)}
                className={cn('flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left', d.id === current?.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')}
              >
                <HugeiconsIcon icon={File02Icon} className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.reference ?? d.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {documentKindLabel(d.kind)}
                    {d.status === 'filed' && d.filedOn ? `, ${m["mp.filed_on"]({ date: format(d.filedOn, 'PP') })}` : `, ${m["mp.draft"]().toLowerCase()}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {current && document ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {document.status === 'filed' ? <Tag tone="done">{m["mp.filed"]()}</Tag> : <Tag tone="open">{m["mp.draft"]()}</Tag>}
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link to="/documents/$documentId" params={{ documentId: current.id }} />}>
                    <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
                    {document.status === 'filed' ? m["mp.open_document"]() : m["mp.write"]()}
                  </Button>
                </div>
                <SheetActions target={sheet} title={document.title} extra={document.status === 'filed' ? <DocumentExport get={() => document} /> : undefined} />
              </div>
              <div ref={sheet}>
                {document.status === 'filed' && document.content ? (
                  <DocumentSheet document={document} />
                ) : (
                  // A draft reads as it will print: the practice's letterhead, then
                  // the paper's own words (a court paper writes its own caption).
                  <PaperSheet head={LETTERS.has(document.kind) ? <Letterhead /> : undefined}>
                    <RichTextPreview value={document.body} className="[&_li]:mb-1 [&_p]:mb-2" />
                  </PaperSheet>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{m["mp.pick_to_start"]()}</div>
          )}
        </div>
      </div>
    </section>
  )
}
