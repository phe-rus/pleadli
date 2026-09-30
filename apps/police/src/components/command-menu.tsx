import * as m from '@/paraglide/messages'
import { entityTypeLabel, useSearch, type SearchResult } from '@/features/search'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Badge } from '@pleadli/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export type CommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The toolbar's search action now opens this overlay in place, rather
 * than navigating to /search — same aggregator, same result model
 * (`features/search`), a different shell. `/search` itself still exists
 * as a real page for a fuller, bookmarkable view.
 */
export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results } = useSearch(query)
  const items = results ?? []

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      // Base UI focuses the popup itself on open; move focus to the input
      // right after so typing works immediately.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlighted(0)
  }, [items.length])

  const select = (result: SearchResult) => {
    navigate(parseSearchRoute(result.route) as never)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{m["command_menu.title"]()}</DialogTitle>
        <DialogDescription className="sr-only">
          {m["command_menu.description"]()}
        </DialogDescription>

        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m["command_menu.placeholder"]()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlighted((h) => Math.min(h + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlighted((h) => Math.max(h - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const result = items[highlighted]
              if (result) select(result)
            }
          }}
        />

        <div className="max-h-96 overflow-y-auto">
          {query.trim().length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{m["command_menu.hint"]()}</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{m["command_menu.no_matches"]()}</p>
          ) : (
            items.map((result, index) => (
              <button
                key={`${result.entityType}:${result.id}`}
                type="button"
                onClick={() => select(result)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left',
                  index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[0.625rem]!">
                      {entityTypeLabel(result.entityType)}
                    </Badge>
                    <span className="truncate text-sm">{result.title}</span>
                  </div>
                  {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
                </div>
                {result.matchedOn.value && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {result.matchedOn.field}: {result.matchedOn.value}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
