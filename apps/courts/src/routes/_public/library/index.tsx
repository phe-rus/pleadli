import { PanelButton } from '@/components/add-panel'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { LibraryForm, libraryKindLabel, libraryKinds, libraryOptions, useLibrary } from '@/features/library'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type Search = { q?: string; kind?: string }

export const Route = createFileRoute('/_public/library/')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.q === 'string' && search.q ? { q: search.q } : {}),
    ...(typeof search.kind === 'string' && libraryKinds.some((k) => k.id === search.kind) ? { kind: search.kind } : {}),
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', kind: search.kind ?? '' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...libraryOptions(deps.q, deps.kind), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The texts kept on this computer, searchable with no connection. Nothing is
 * bundled: each text was added by someone, with where it came from. */
function RouteComponent() {
  const { q = '', kind = '' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: items } = useLibrary(q, kind)
  const [text, setText] = useState(q)

  useEffect(() => {
    const id = setTimeout(() => {
      if (text !== q) void navigate({ to: '/library', search: { ...(text ? { q: text } : {}), ...(kind ? { kind } : {}) }, replace: true })
    }, 250)
    return () => clearTimeout(id)
  }, [text, q, kind, navigate])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Library</h1>
          <p>Statutes, guidelines and authorities kept on this computer. They are searched without a connection.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Add a text" title="Keep a text" description="Paste a statute, guideline or authority, and say where it came from." variant="default">
            {({ close, setDirty }) => <LibraryForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search titles, citations and the text itself" aria-label="Search the library" />

      <nav aria-label="Kinds of text" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {[{ id: '', label: 'All' }, ...libraryKinds].map((item) => (
          <Link
            key={item.id || 'all'}
            to="/library"
            search={{ ...(q ? { q } : {}), ...(item.id ? { kind: item.id } : {}) }}
            replace
            aria-current={item.id === kind ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-1.5 no-underline',
              item.id === kind ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyNote>
          {q || kind
            ? 'Nothing in the library matches. It holds only what has been added to it.'
            : 'The library is empty. Nothing is bundled with the application: add the texts you rely on, with where each came from, and they are here with no connection.'}
        </EmptyNote>
      ) : (
        <RowList>
          {items.map((item) => (
            <Row
              key={item.id}
              aligned
              title={
                <Link to="/library/$itemId" params={{ itemId: item.id }} search={q ? { q } : {}} className="text-foreground">
                  {item.title}
                </Link>
              }
              summary={
                item.snippet ? (
                  <>…{item.snippet}…</>
                ) : (
                  [item.citation, item.source ? `from ${item.source}` : null, item.licence].filter(Boolean).join('. ') || undefined
                )
              }
              trailing={<Tag tone="neutral">{libraryKindLabel(item.kind)}</Tag>}
            />
          ))}
        </RowList>
      )}
    </article>
  )
}
