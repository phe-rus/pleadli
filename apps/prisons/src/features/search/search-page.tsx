import { entityTypeLabel } from './schema'
import { useSearch } from './queries'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Badge } from '@pleadli/ui/badge'
import { Input } from '@pleadli/ui/input'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const { data: results } = useSearch(query)
  const items = results ?? []

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_search_search_pleadli_prisons()}</h1>
          <p className="md:max-w-sm">{m.route_search_find_anything_you_re_legitimately_allowe()}</p>
        </div>
      </header>

      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={m.route_search_search_by_name_national_id_reference()}
        className="max-w-lg"
      />

      <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
        {query.trim().length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{m.route_search_type_to_search_across_the_prison()}</p>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{m.route_search_no_matches_yet()}</p>
        ) : (
          items.map((result) => {
            const { to, search } = parseSearchRoute(result.route)
            return (
              <Link
                key={`${result.entityType}:${result.id}`}
                to={to as never}
                search={search as never}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[0.625rem]!">
                      {entityTypeLabel(result.entityType)}
                    </Badge>
                    <span className="truncate">{result.title}</span>
                  </div>
                  {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
                </div>
                {result.matchedOn.value && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {result.matchedOn.field}: {result.matchedOn.value}
                  </span>
                )}
              </Link>
            )
          })
        )}
      </div>
    </article>
  )
}
