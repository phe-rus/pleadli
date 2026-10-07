import { EmptyNote } from '@/components/planned'
import { documentsOptions, useDocuments, VerifyCard, type DocumentSummary } from '@/features/documents'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@pleadli/ui/dialog'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/documents/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...documentsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** A document drawn small, as Pages shows one in its browser: an A4 page
 * with the letterhead, the title and a few lines, marked Draft until filed. */
function Thumbnail({ doc }: { doc: DocumentSummary }) {
  const filed = doc.status === 'filed'
  return (
    <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="group flex min-w-0 flex-col gap-2 text-foreground no-underline">
      <div className="relative flex aspect-[210/297] w-full flex-col items-center gap-1.5 overflow-hidden rounded-md bg-white p-[9%] shadow-sm ring-1 ring-black/10 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <span className="h-[2.2%] w-[60%] rounded-sm bg-zinc-300" />
        <span className="mb-1 h-px w-full bg-zinc-300" />
        <span className="mb-[6%] line-clamp-2 text-center font-serif text-[0.5625rem] leading-tight font-bold text-zinc-800 uppercase">{doc.title}</span>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="h-[1.6%] rounded-sm bg-zinc-200" style={{ width: `${i % 3 === 2 ? 70 : 100}%` }} />
        ))}
        {filed ? (
          <span className="absolute right-[9%] bottom-[6%] size-[14%] rounded-[2px] bg-[repeating-conic-gradient(#27272a_0_25%,#fff_0_50%)] bg-[length:25%_25%]" />
        ) : (
          <span className="absolute bottom-[6%] left-[9%] font-serif text-[0.5rem] font-bold tracking-wider text-amber-600">{m["document.draft"]().toUpperCase()}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-[0.8125rem] font-medium">{doc.title}</span>
        <span className="truncate text-xs text-muted-foreground">{doc.courtNumber ?? doc.matterTitle}</span>
        <span className="truncate text-xs text-muted-foreground">{filed && doc.filedOn ? m["docs.filed_on"]({ date: formatDay(doc.filedOn) }) : m["docs.changed_on"]({ date: formatDay(doc.updatedAt) })}</span>
      </div>
    </Link>
  )
}

type Filter = 'all' | 'draft' | 'filed'

/** Every document the practice has drafted or filed, as a library of pages.
 * A document is started from its matter, so this page finds them and does not
 * create them; checking a paper someone hands you is a sheet. */
function RouteComponent() {
  const { data: documents } = useDocuments()
  const [filter, setFilter] = useState<Filter>('all')
  const shown = documents.filter((d) => filter === 'all' || d.status === filter)
  const drafts = documents.filter((d) => d.status === 'draft').length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.documents"]()}</h1>
          <p>{m["docs.lead"]()}</p>
        </div>
        <div className="page-actions">
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="secondary">{m["docs.verify"]()}</Button>} />
            <DialogContent className="sm:max-w-lg">
              <VerifyCard />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {documents.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={File02Icon} />}>{m["docs.none"]()}</EmptyNote>
      ) : (
        <section className="flex flex-col gap-4">
          <Segmented
            label={m["nav.documents"]()}
            value={filter}
            onChange={setFilter}
            className="self-start"
            items={[
              { value: 'all', label: m["docs.all"]() },
              { value: 'draft', label: m["docs.drafts"](), count: drafts },
              { value: 'filed', label: m["docs.filed"]() },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyNote>{m["docs.none_here"]()}</EmptyNote>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-5 gap-y-6">
              {shown.map((doc) => (
                <Thumbnail key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </section>
      )}
    </article>
  )
}
