import { Controls } from '@/components/toolbar/controls'
import { SidebarToggle } from '@/components/toolbar/sidebar-toggle'
import { ArrowLeft01Icon, ArrowRight01Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { setAssistOpen, useAssistOpen } from '@/features/assist/dock'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { TabStrip } from './tab-strip'
import { useTabActions } from './tab-actions'
import { useWorkspace } from './tabs-store'
import * as m from '@/paraglide/messages'

/** The header of the centre column: the tabs, and the tools that belong to the
 * whole window, Assist among them. It is the width of the content beneath it, so it follows the
 * sidebar folding. The window buttons sit at its right end. */
export function CenterHeader() {
  const { tabs, leftOpen, setLeftOpen } = useWorkspace()
  const { cycle } = useTabActions()
  const hasSeveral = tabs.length > 1
  const assistOpen = useAssistOpen()

  return (
    <header data-tauri-drag-region className="relative flex h-12 shrink-0 items-center border-b border-border/40 bg-background/80 backdrop-blur-xl print:hidden">
      {/* The way back to the sidebar once it is folded; while it is open the
          control is in its own header. */}
      {/* With the sidebar folded, the window buttons and the sidebar button come here. */}
      {!leftOpen && (
        <div className="flex shrink-0 items-center gap-3 ps-4 pe-2">
          <Controls />
          <SidebarToggle open={false} onToggle={() => setLeftOpen(true)} />
        </div>
      )}

      <TabStrip />

      <nav aria-label={m["workspace.window"]()} data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(-1)} aria-label={m["workspace.tab.previous"]()} title={m["workspace.tab.previous_shortcut"]()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(1)} aria-label={m["workspace.tab.next"]()} title={m["workspace.tab.next_shortcut"]()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant={assistOpen ? 'secondary' : 'ghost'}
          onClick={() => setAssistOpen((o) => !o)}
          aria-label={m["assist.title"]()}
          aria-pressed={assistOpen}
          title={m["assist.title"]()}
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={SparklesIcon} className={assistOpen ? 'size-4 text-primary' : 'size-4'} />
        </Button>
      </nav>
    </header>
  )
}
