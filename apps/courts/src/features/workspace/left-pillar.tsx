import { BrandLogo } from '@/features/brand'
import { Controls } from '@/components/toolbar/controls'
import { SidebarToggle } from '@/components/toolbar/sidebar-toggle'
import { useProfile } from '@/features/profile'
import { cn } from '@pleadli/ui/lib/utils'
import { Navigator } from './navigator'
import { useWorkspace } from './tabs-store'

/** One sidebar, matching the other workspaces. Window controls move to the
 * centre header when folded; the stored tabs and navigation stay mounted. */
export function LeftPillar() {
  const { leftOpen, setLeftOpen } = useWorkspace()
  const { data: profile } = useProfile()

  return (
    <div inert={!leftOpen} data-open={leftOpen} className={cn('shell-sidebar flex shrink-0 flex-col overflow-hidden bg-sidebar print:hidden', leftOpen ? 'border-r border-sidebar-border' : 'w-0')}>
      <header data-tauri-drag-region className="flex h-12 w-64 shrink-0 items-center gap-3 ps-4 pe-2">
        <Controls />
        <span data-tauri-drag-region className="flex-1" />
        <SidebarToggle open={leftOpen} onToggle={() => setLeftOpen(false)} />
      </header>
      <div data-tauri-drag-region className="flex w-64 shrink-0 items-center gap-2.5 px-4 pt-1 pb-3">
        <BrandLogo className="size-8 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[0.8125rem] leading-4 font-semibold">Pleadli Courts</span>
          <span className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{profile?.courtName?.trim() || 'Bench workspace'}</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Navigator />
      </div>
    </div>
  )
}
