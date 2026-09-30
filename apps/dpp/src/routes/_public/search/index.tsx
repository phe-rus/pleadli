import * as m from '@/paraglide/messages'
import { Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { entityTypeLabel, useSearch } from '@/features/search'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/search/')({
  component: RouteComponent,
})

/** Search across what DPP holds. Today it finds people and files; the other
 * kinds of record are listed as planned so the boundary is plain. */
function RouteComponent() {
  const [query, setQuery] = useState('')
  const { data: results } = useSearch(query)
  const items = results ?? []

  return (
    <article className="page page-narrow">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.search"]()}</h1>
          <p>{m["page.search.about"]()}</p>
        </div>
      </header>

      <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m["page.search.placeholder"]()} />

      {query.trim().length === 0 ? (
        <p>{m["page.search.type"]()}</p>
      ) : items.length === 0 ? (
        <p>{m["page.search.none"]()}</p>
      ) : (
        <RowList>
          {items.map((result) => {
            const { to, search } = parseSearchRoute(result.route)
            return (
              <Row
                key={`${result.entityType}:${result.id}`}
                title={
                  <Link to={to as never} search={search as never} className="text-foreground no-underline hover:underline">
                    {result.title}
                  </Link>
                }
                summary={result.subtitle ?? undefined}
                trailing={
                  <>
                    {result.matchedOn.value && <span className="text-muted-foreground">{result.matchedOn.field}: {result.matchedOn.value}</span>}
                    <Tag tone="neutral">{entityTypeLabel(result.entityType)}</Tag>
                  </>
                }
              />
            )
          })}
        </RowList>
      )}

      <Planned title={m["page.search.planned_title"]()} covers={[m["page.search.planned_1"](), m["page.search.planned_2"](), m["page.search.planned_3"](), m["page.search.planned_4"]()]}>
        {m["page.search.planned_body"]()}
      </Planned>
    </article>
  )
}
