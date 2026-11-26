import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useState, type ReactNode } from 'react'

export type ReservedTab = 'overview' | 'papers' | 'people' | 'history'
export const RESERVED_TABS: readonly ReservedTab[] = ['overview', 'papers', 'people', 'history']

export type RecordTabsLabels = Record<ReservedTab, { label: string; empty: string; action: string; /** A number shown beside the name, like ULII's tab counts. Left out when unknown. */ count?: number }>

export type RecordTabsProps = {
  labels: RecordTabsLabels
  /** What each reserved tab shows. A tab with no content shows its calm empty state. */
  content: Partial<Record<ReservedTab, ReactNode>>
  /** The one button in a reserved tab's empty state. */
  onEmptyAction?: Partial<Record<ReservedTab, () => void>>
  /** The app's own tabs, after the four reserved ones. */
  extra?: { id: string; label: string; content: ReactNode }[]
  /** Controlled selection; leave out to let the frame keep it. */
  value?: string
  onValueChange?: (id: string) => void
}

/** The frame every record page uses: Overview, Papers, People, History, always
 * in that order, then whatever the app adds. */
export function RecordTabsView({ labels, content, onEmptyAction, extra = [], value, onValueChange }: RecordTabsProps) {
  const [own, setOwn] = useState<string>('overview')
  const current = value ?? own
  const select = (id: string) => (onValueChange ? onValueChange(id) : setOwn(id))
  const tabs: { id: string; label: string; count?: number }[] = [...RESERVED_TABS.map((id) => ({ id, label: labels[id].label, count: labels[id].count })), ...extra.map((tab) => ({ id: tab.id, label: tab.label }))]

  const body = () => {
    const added = extra.find((tab) => tab.id === current)
    if (added) return added.content
    const id = (RESERVED_TABS.includes(current as ReservedTab) ? current : 'overview') as ReservedTab
    const shown = content[id]
    if (shown) return shown
    const text = labels[id]
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="max-w-sm text-muted-foreground">{text.empty}</p>
        {onEmptyAction?.[id] && (
          <Button variant="outline" size="sm" onClick={onEmptyAction[id]} className="cursor-pointer">
            {text.action}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 items-center gap-1 border-b border-border/40 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current === tab.id}
            onClick={() => select(tab.id)}
            className={cn(
              'relative h-9 cursor-pointer px-3 text-[0.8125rem] outline-none transition-colors duration-(--shell-motion-hover) focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
              current === tab.id ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count != null && <span className="ms-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {body()}
      </div>
    </div>
  )
}

export type CountedTab = { id: string; label: string; count?: number | string; content: ReactNode }

/** Named tabs with counts, for a record whose parts are its own (a referral's
 * people, statements, exhibits). Same look as RecordTabsView, no reserved names. */
export function CountedTabs({ tabs, initial }: { tabs: CountedTab[]; initial?: string }) {
  const [own, setOwn] = useState(initial ?? tabs[0]?.id)
  const current = tabs.find((t) => t.id === own) ?? tabs[0]
  return (
    <div className="flex min-h-0 flex-col">
      <div role="tablist" className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/40">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current?.id === tab.id}
            onClick={() => setOwn(tab.id)}
            className={cn(
              'relative h-9 cursor-pointer px-3 text-[0.8125rem] outline-none transition-colors duration-(--shell-motion-hover) focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
              current?.id === tab.id ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count != null && <span className="ms-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-5">{current?.content}</div>
    </div>
  )
}
