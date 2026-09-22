import { Controls } from '@/components/toolbar/controls'
import { Toggletheme } from '@/components/toggle-theme'
import { ArrowLeft01Icon, ArrowRight01Icon, PanelLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { TabStrip } from './tab-strip'
import { useTabActions } from './tab-actions'
import { useWorkspace } from './tabs-store'

/** The header of the centre column: the tabs, and the tools that belong to the
 * whole window. It is the width of the content beneath it, so it follows the
 * sidebar folding. The window buttons sit at its right end. */
export function CenterHeader() {
  const { tabs, leftOpen, setLeftOpen } = useWorkspace()
  const { cycle } = useTabActions()
  const hasSeveral = tabs.length > 1

  return (
    <header data-tauri-drag-region className="relative flex h-9 shrink-0 items-center border-b border-border/20 bg-background print:hidden">
      {/* The way back to the sidebar once it is folded; while it is open the
          control is in its own header. */}
      {!leftOpen && (
        <Button size="icon-sm" variant="ghost" onClick={() => setLeftOpen(true)} aria-label="Show sidebar" title="Show sidebar" className="ml-2 cursor-pointer">
          <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
        </Button>
      )}

      <TabStrip />

      <nav aria-label="Window" data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(-1)} aria-label="Previous tab" title="Previous tab (Ctrl Shift Tab)" className="cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(1)} aria-label="Next tab" title="Next tab (Ctrl Tab)" className="cursor-pointer">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
        <Toggletheme />
        <Controls />
      </nav>
    </header>
  )
}
