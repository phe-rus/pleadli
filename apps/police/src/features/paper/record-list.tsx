import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { format } from '@/lib/date'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { useMemo, useState, type ReactNode } from 'react'
import { PaperWindow } from './record-paper'

type Grouping = 'day' | 'month' | 'none'

const keyOf = (ms: number, by: Grouping) => (by === 'day' ? format(ms, 'yyyy-MM-dd') : by === 'month' ? format(ms, 'yyyy-MM') : '')

function titleOf(ms: number, by: Grouping) {
  if (by === 'month') return format(ms, 'MMMM yyyy')
  const key = keyOf(ms, 'day')
  if (key === keyOf(Date.now(), 'day')) return `${m["nav.today"]()} · ${format(ms, 'EEEE d MMMM')}`
  if (key === keyOf(Date.now() - 86_400_000, 'day')) return `${m["sd_page.yesterday"]()} · ${format(ms, 'EEEE d MMMM')}`
  return format(ms, 'EEEE d MMMM yyyy')
}

/**
 * A register as Apple would list it: a search field, the records newest
 * first under their day or month, each a calm two-line row. A row opens the
 * record as its paper over the list. `open` (a deep link) opens one at once.
 */
export function RecordList<T extends { id: string }>({
  items,
  date,
  label,
  detail,
  value,
  searchText,
  groupBy = 'month',
  paper,
  windowTitle,
  empty,
  emptyIcon,
  searchPlaceholder,
  opened,
  onOpened,
}: {
  items: readonly T[]
  date: (item: T) => number
  label: (item: T) => ReactNode
  detail?: (item: T) => ReactNode
  value?: (item: T) => ReactNode
  searchText: (item: T) => string
  groupBy?: Grouping
  paper: (item: T) => ReactNode
  windowTitle: (item: T) => string
  empty: string
  emptyIcon?: ReactNode
  searchPlaceholder: string
  /** The record open over the list, when the page controls it (deep links). */
  opened?: string | null
  onOpened?: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [ownOpen, setOwnOpen] = useState<string | null>(null)
  const openId = opened !== undefined ? opened : ownOpen
  const setOpen = (id: string | null) => (onOpened ? onOpened(id) : setOwnOpen(id))
  const current = openId ? items.find((i) => i.id === openId) : undefined

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = items.filter((i) => !needle || searchText(i).toLowerCase().includes(needle)).sort((a, b) => date(b) - date(a))
    const map = new Map<string, T[]>()
    for (const item of shown) {
      const key = keyOf(date(item), groupBy)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, groupBy])

  if (items.length === 0) return <EmptyNote icon={emptyIcon}>{empty}</EmptyNote>

  return (
    <>
      <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      {groups.length === 0 && <EmptyNote>{m["files.no_match"]({ query })}</EmptyNote>}
      {groups.map((list) => (
        <Group key={keyOf(date(list[0]), groupBy) || 'all'} title={groupBy === 'none' ? undefined : titleOf(date(list[0]), groupBy)}>
          {list.map((item) => (
            <GroupRow key={item.id} label={label(item)} detail={detail?.(item)} value={value?.(item)} chevron onClick={() => setOpen(item.id)} />
          ))}
        </Group>
      ))}
      {current && (
        <PaperWindow open onOpenChange={(open) => !open && setOpen(null)} title={windowTitle(current)}>
          {paper(current)}
        </PaperWindow>
      )}
    </>
  )
}
