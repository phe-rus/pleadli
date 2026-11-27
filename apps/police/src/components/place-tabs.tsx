import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'

export type PlaceTab = { id: string; to: string; label: string; count?: number }

/**
 * The tabs of a place that is one thing to the officer but two routes in the
 * app, each with a count: Front desk (diary, incidents), People (people,
 * vehicles). Two routes keep every old link working; the shared tabs make
 * them read as one place.
 */
export function PlaceTabs({ label, tabs, active }: { label: string; tabs: readonly PlaceTab[]; active: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          aria-current={tab.id === active ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
            tab.id === active ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tabular-nums text-muted-foreground"> ({tab.count})</span>}
        </Link>
      ))}
    </nav>
  )
}
