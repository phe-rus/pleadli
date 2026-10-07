import * as m from '@/paraglide/messages'
import { BrandLogo } from '@/features/brand'
import { Controls } from '@/components/toolbar/controls'
import { SidebarToggle } from '@/components/toolbar/sidebar-toggle'
import { useInstallation } from '@/features/session'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Navigator } from './navigator'
import { useWorkspace } from './tabs-store'

/** The left pillar: the sidebar running the full height of the window, on its
 * own quiet grey. Its top is the window's title bar, holding the window
 * buttons and the sidebar button side by side, as on a Mac; the crest and the
 * station's name sit just below. Folding it hides it entirely; both buttons
 * then move to the centre's header. */
export function LeftPillar() {
  const { leftOpen, setLeftOpen } = useWorkspace()
  const { data: installation } = useInstallation()
  const { data: profile } = useQuery(stationProfileOptions())
  const command = installation?.mode === 'command'

  return (
    <div className={cn('flex shrink-0 flex-col overflow-hidden bg-sidebar print:hidden', leftOpen ? 'border-r border-sidebar-border' : 'w-0')}>
      {/* `w-0 min-w-full`: as wide as the pillar, but adds nothing to how wide
          the pillar is, so folding hides the contents rather than squeezing them. */}
      <header data-tauri-drag-region className="flex h-12 w-0 min-w-full shrink-0 items-center overflow-hidden">
        <div data-tauri-drag-region className="flex w-64 shrink-0 items-center gap-3 ps-4 pe-2">
          <Controls />
          <span data-tauri-drag-region className="flex-1" />
          <SidebarToggle open={leftOpen} onToggle={() => setLeftOpen(false)} />
        </div>
      </header>
      <div data-tauri-drag-region className="flex w-64 shrink-0 items-center gap-2.5 px-4 pt-1 pb-3">
        <BrandLogo className="size-8 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[0.8125rem] leading-4 font-semibold">{m["workspace.product"]()}</span>
          <span className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
            {profile?.name || (command ? m["workspace.command_not_named"]() : m["workspace.station_not_named"]())}
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Navigator />
      </div>
    </div>
  )
}
