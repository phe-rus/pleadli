import { Tag } from '@/components/status-tag'
import { copyText } from '@/lib/clipboard'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useLibrarySearch } from './queries'
import { libraryKindLabel } from './schema'

/** Searching the library while drafting a decision. It sits beside the editor;
 * a citation is copied and pasted into the text, so what enters the decision is
 * always something the officer put there. */
export function CitationSearch() {
  const [query, setQuery] = useState('')
  const { data: results, isFetching } = useLibrarySearch(query)

  return (
    <section aria-labelledby="library-search" className="page-section">
      <h2 id="library-search">Library</h2>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the statutes and authorities you keep" aria-label="Search the library" />
      {query.trim() === '' ? (
        <p className="text-muted-foreground">Type to search the texts kept on this computer.</p>
      ) : results && results.length === 0 && !isFetching ? (
        <p className="text-muted-foreground">No match. The library holds only what has been added to it.</p>
      ) : (
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {(results ?? []).map((item) => (
            <div key={item.id} role="listitem" className="flex flex-col gap-1 py-2">
              <div className="flex items-center gap-2">
                <Tag tone="neutral">{libraryKindLabel(item.kind)}</Tag>
                <Link to="/library/$itemId" params={{ itemId: item.id }} search={{ q: query.trim() }} className="text-foreground">
                  {item.title}
                </Link>
              </div>
              {item.citation && <p className="text-muted-foreground">{item.citation}</p>}
              {item.snippet && <p className="text-muted-foreground">…{item.snippet}…</p>}
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => ((await copyText([item.title, item.citation].filter(Boolean).join(', '))) ? t.success('Citation copied') : t.error('Could not copy'))}
                >
                  Copy citation
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
