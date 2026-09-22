import { engagementLabel, useMatterSearch, type MatterSummary } from '@/features/matters'
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

/** Finding a matter by its title, your reference, the court number, the offence,
 * or the client's name. */
export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results } = useMatterSearch(query)
  const items = results ?? []

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlighted(0)
  }, [items.length])

  const select = (result: MatterSummary) => {
    void navigate({ to: '/matters/$matterId', params: { matterId: result.id } })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search Pleadli Lawyers</DialogTitle>
        <DialogDescription className="sr-only">Search matters by title, reference, court number, offence or the client&rsquo;s name.</DialogDescription>

        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, reference, court number, client…"
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
            <p className="p-3 text-xs text-muted-foreground">Type to search your matters.</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No matches.</p>
          ) : (
            items.map((result, index) => (
              <button
                key={result.id}
                type="button"
                onClick={() => select(result)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn('flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left', index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60')}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[0.625rem]!">
                      {result.courtNumber ?? result.ourRef ?? 'No number'}
                    </Badge>
                    <span className="truncate text-sm">{result.title}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {result.clientName}. {engagementLabel(result.engagement)}
                  </p>
                </div>
                {result.status === 'closed' && <span className="shrink-0 text-xs text-muted-foreground">Closed</span>}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
