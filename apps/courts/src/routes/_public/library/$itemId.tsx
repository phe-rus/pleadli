import { Tag } from '@/components/status-tag'
import { LibraryForm, libraryItemOptions, libraryKindLabel, useLibraryItem, useRemoveLibraryItem } from '@/features/library'
import { PanelButton } from '@/components/add-panel'
import { ApiError, messageOf } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/library/$itemId')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => (typeof search.q === 'string' && search.q ? { q: search.q } : {}),
  loader: async ({ context, params }) => {
    try {
      const item = await context.queryClient.query({ ...libraryItemOptions(params.itemId), staleTime: 'static' })
      if (!item) throw notFound()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

/** The body with each match of the search marked, matched as plain text. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [{ text, hit: false }]
    const out: { text: string; hit: boolean }[] = []
    const lower = text.toLowerCase()
    let from = 0
    for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
      if (at > from) out.push({ text: text.slice(from, at), hit: false })
      out.push({ text: text.slice(at, at + q.length), hit: true })
      from = at + q.length
    }
    if (from < text.length) out.push({ text: text.slice(from), hit: false })
    return out
  }, [text, query])

  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) => (part.hit ? <mark key={index}>{part.text}</mark> : part.text))}
    </p>
  )
}

/** One kept text, read in full with the search marked. */
function RouteComponent() {
  const { itemId } = Route.useParams()
  const { q = '' } = Route.useSearch()
  const { data: item } = useLibraryItem(itemId)
  const remove = useRemoveLibraryItem()
  const navigate = useNavigate()
  if (!item) return null

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{item.title}</h1>
          <p>
            {[item.citation, item.source ? `from ${item.source}` : null, item.licence ? `licence ${item.licence}` : null, `kept ${format(item.createdAt, 'PP')}`].filter(Boolean).join('. ')}.{' '}
            <Link to="/library" className="text-primary">
              Library
            </Link>
          </p>
        </div>
        <div className="page-actions">
          <Tag tone="neutral">{libraryKindLabel(item.kind)}</Tag>
          <Button size="sm" variant="secondary" onClick={async () => ((await copyText([item.title, item.citation].filter(Boolean).join(', '))) ? t.success('Citation copied') : t.error('Could not copy'))}>
            Copy citation
          </Button>
          <PanelButton label="Edit" title="Edit the text" description="Correct the text or where it came from." variant="secondary" icon={false}>
            {({ close, setDirty }) => <LibraryForm existing={item} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!window.confirm(`Remove ${item.title} from the library?`)) return
              remove.mutate(item.id, {
                onSuccess: () => {
                  t.success('Removed')
                  void navigate({ to: '/library' })
                },
                onError: (error) => t.error('Could not remove it', { description: messageOf(error) }),
              })
            }}
          >
            Remove
          </Button>
        </div>
      </header>
      <Highlighted text={item.body} query={q} />
    </article>
  )
}
