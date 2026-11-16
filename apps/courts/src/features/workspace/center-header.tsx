import { Controls } from '@/components/toolbar/controls'
import { Toggletheme } from '@/components/toggle-theme'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { SidebarToggle } from '@/components/toolbar/sidebar-toggle'
import { QuickActions } from './quick-actions'
import { TabStrip } from './tab-strip'
import { useTabActions } from './tab-actions'
import { useWorkspace } from './tabs-store'

/** The header of the centre column: the tabs, and the tools that belong to the
 * whole window. It is the width of the content beneath it, so it follows the
 * sidebar folding. Window controls move here when the sidebar is folded. */
export function CenterHeader() {
  const { tabs, leftOpen, setLeftOpen } = useWorkspace()
  const { cycle } = useTabActions()
  const hasSeveral = tabs.length > 1

  return (
    <header data-tauri-drag-region className="relative flex h-12 shrink-0 items-center gap-1 bg-background/80 backdrop-blur-xl print:hidden">
      {/* The way back to the sidebar once it is folded; while it is open the
          control is in its own header. */}
      {!leftOpen && (
        <div className="flex shrink-0 items-center gap-3 ps-4 pe-2">
          <Controls />
          <SidebarToggle open={false} onToggle={() => setLeftOpen(true)} />
        </div>
      )}

      <TabStrip />

      <nav aria-label="Window" data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        <span className="shell-capsule">
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(-1)} aria-label="Previous tab" title="Previous tab (Ctrl Shift Tab)" className="cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(1)} aria-label="Next tab" title="Next tab (Ctrl Tab)" className="cursor-pointer">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
        </span>
        <QuickActions />
        <Toggletheme />
      </nav>
    </header>
  )
}
