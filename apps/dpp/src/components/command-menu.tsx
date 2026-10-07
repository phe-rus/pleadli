import { dppNav } from '@/data/navigationItems'
import { useSearch, type SearchResult } from '@/features/search'
import { fileFolders, fileViews } from '@/features/prosecution-files/schema'
import { productName, serviceNames } from '@/lib/jurisdiction'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Folder01Icon, Search01Icon, UserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { cn } from '@pleadli/ui/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import * as m from '@/paraglide/messages'

export type CommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Item = { key: string; group: string; icon: typeof Search01Icon; title: string; subtitle?: string; go: () => void }

const kindOf = (entityType: string) =>
  entityType === 'person' ? { group: m["search.group.people"](), icon: UserIcon } : { group: m["search.group.files"](), icon: Folder01Icon }

/**
 * Search, the way Spotlight does it: one large field near the top of the
 * window, results grouped by what they are, the chosen one in the accent
 * colour, the keyboard first. Before anything is typed it offers the places,
 * including the office-wide registers that have no row of their own in the
 * sidebar.
 */
export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results } = useSearch(query)
  const q = query.trim().toLowerCase()

  const go = (to: string) => {
    void navigate(parseSearchRoute(to) as never)
    onOpenChange(false)
  }
  const places: Item[] = [
    ...dppNav.filter((item) => item.to !== '/search' && item.to !== '/files').map((item) => ({ key: `place:${item.to}`, title: item.label(), to: item.to, icon: item.icon })),
    ...fileFolders.map((id) => ({ key: `folder:${id}`, title: fileViews.find((v) => v.id === id)!.label, to: `/files?view=${id}`, icon: Folder01Icon })),
  ]
    .filter((p) => !q || p.title.toLowerCase().includes(q))
    .slice(0, q ? 5 : 8)
    .map((p) => ({ key: p.key, group: m["search.group.places"](), icon: p.icon, title: p.title, go: () => go(p.to) }))
  const found: Item[] = q
    ? (results ?? []).map((r: SearchResult) => ({
        key: `${r.entityType}:${r.id}`,
        ...kindOf(r.entityType),
        title: r.title,
        // What matched is worth saying only when it is not already the title or the line under it.
        subtitle: [r.subtitle, r.matchedOn.value && !r.title.includes(r.matchedOn.value) && !r.subtitle.includes(r.matchedOn.value) ? r.matchedOn.value : null].filter(Boolean).join(' · '),
        go: () => go(r.route),
      }))
    : []
  // Records first once something is typed: that is what a search is for.
  const items = q ? [...found, ...places] : places

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlighted(0)
  }, [items.length, q])

  let lastGroup = ''
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl bg-popover/95 p-0 shadow-2xl ring-black/10 backdrop-blur-xl sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{m["command_menu.title"]({ product: productName() })}</DialogTitle>
        <DialogDescription className="sr-only">{m["command_menu.description"]({ office: serviceNames().short })}</DialogDescription>

        <div className="flex items-center gap-3 px-4">
          <HugeiconsIcon icon={Search01Icon} className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m["command_menu.placeholder"]()}
            aria-label={m["command_menu.placeholder"]()}
            className="h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlighted((h) => Math.min(h + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlighted((h) => Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                items[highlighted]?.go()
              }
            }}
          />
        </div>

        {(items.length > 0 || q) && (
          <div role="listbox" className="max-h-[22rem] overflow-y-auto border-t border-border/60 p-1.5">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-muted-foreground">{m["command_menu.no_matches"]()}</p>
            ) : (
              items.map((item, index) => {
                const heading = item.group !== lastGroup ? item.group : null
                lastGroup = item.group
                const active = index === highlighted
                return (
                  <div key={item.key}>
                    {heading && <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold text-muted-foreground">{heading}</p>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={item.go}
                      onMouseMove={() => setHighlighted(index)}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left', active ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                    >
                      <HugeiconsIcon icon={item.icon} className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[0.875rem]">{item.title}</span>
                        {item.subtitle && <span className={cn('truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{item.subtitle}</span>}
                      </span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-4 border-t border-border/60 px-4 py-2 text-[0.6875rem] text-muted-foreground">
          <span>↑ ↓ {m["search.hint.move"]()}</span>
          <span>↵ {m["search.hint.open"]()}</span>
          <span>esc {m["search.hint.close"]()}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
