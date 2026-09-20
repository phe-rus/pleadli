import { DevRoleSwitch } from '@/components/dev-role-switch'
import { Toggletheme } from '@/components/toggle-theme'
import { ArrowLeft01Icon, ArrowRight01Icon, PanelLeftIcon, PanelRightIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import type { ReactNode } from 'react'
import { TabStrip } from './tab-strip'
import { useTabActions } from './tab-actions'
import { useWorkspace } from './tabs-store'
import { m } from '@/paraglide/messages'

/** The header of the centre column: the tabs, and the tools that belong to the
 * whole window. It is the width of the content beneath it, so it follows the
 * sidebar folding and the right pillar opening. `controls` are the window buttons, which only this header
 * carries while the right pillar is closed. */
export function CenterHeader({ controls }: { controls: ReactNode }) {
  const { tabs, leftOpen, setLeftOpen, rightOpen, setRightOpen } = useWorkspace()
  const { cycle } = useTabActions()
  const hasSeveral = tabs.length > 1

  return (
    <header data-tauri-drag-region className="relative flex h-9 shrink-0 items-center border-b border-border/20 bg-background print:hidden">
      {/* The way back to the sidebar once it is folded; while it is open the
          control is in its own header. */}
      {!leftOpen && (
        <Button size="icon-sm" variant="ghost" onClick={() => setLeftOpen(true)} aria-label={m.shell_show_sidebar()} title={m.shell_show_sidebar()} className="ml-2 cursor-pointer">
          <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
        </Button>
      )}

      <TabStrip />

      <nav aria-label={m.shell_window()} data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(-1)} aria-label={m.shell_previous_tab()} title={m.shell_previous_tab()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(1)} aria-label={m.shell_next_tab()} title={m.shell_next_tab()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
        {import.meta.env.DEV && <DevRoleSwitch />}
        <Toggletheme />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setRightOpen((open) => !open)}
          aria-label={rightOpen ? m.shell_hide_panel() : m.shell_show_panel()}
          aria-pressed={rightOpen}
          title={rightOpen ? m.shell_hide_panel() : m.shell_show_panel()}
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={PanelRightIcon} className="size-4" />
        </Button>
        {controls}
      </nav>
    </header>
  )
}
