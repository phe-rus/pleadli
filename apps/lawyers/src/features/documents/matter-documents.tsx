import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import * as m from '@/paraglide/messages'
import { PaperSheet } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { DocumentSheet } from './document-sheet'
import { documentOptions } from './queries'
import { documentKindLabel, type DocumentSummary } from './schema'

/** The matter's documents with the chosen one shown as its page beside the
 * list: a filed document as the sealed sheet, a draft as it reads now. The
 * document's own page is where it is written, filed, printed and checked. */
export function MatterDocuments({ documents }: { documents: DocumentSummary[] }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const current = documents.find((d) => d.id === chosen) ?? documents[0]
  const { data: document } = useQuery({ ...documentOptions(current?.id ?? ''), enabled: !!current })

  return (
    <section aria-labelledby="documents" className="page-section">
      <h2 id="documents">{m["mp.documents"]()}</h2>
      {!current ? (
        <EmptyNote>{m["mp.no_documents"]()}</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[14rem_1fr]">
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {documents.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setChosen(d.id)}
                  className={cn('flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left', d.id === current.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')}
                >
                  <span className="w-full truncate text-sm">{d.reference ?? d.title}</span>
                  <span className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                    {documentKindLabel(d.kind)}
                    {d.status === 'filed' && d.filedOn ? `, ${m["mp.filed_on"]({ date: format(d.filedOn, 'PP') })}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {current.status === 'filed' ? <Tag tone="done">{m["mp.filed"]()}</Tag> : <Tag tone="open">{m["mp.draft"]()}</Tag>}
              <Link to="/documents/$documentId" params={{ documentId: current.id }} className="text-sm text-primary">
                {m["mp.open_document"]()}
              </Link>
            </div>
            {document &&
              (document.status === 'filed' && document.content ? (
                <DocumentSheet document={document} />
              ) : (
                <PaperSheet
                  title={document.title}
                  head={
                    <header className="mb-6 flex flex-col items-center gap-0.5 text-center">
                      {document.courtNumber && <p className="font-semibold uppercase">{document.courtNumber}</p>}
                      <p className="font-semibold uppercase">{document.matterTitle}</p>
                    </header>
                  }
                >
                  <RichTextPreview value={document.body} />
                </PaperSheet>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}
