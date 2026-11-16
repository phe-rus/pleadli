import { DevRoleSwitch } from '@/components/dev-role-switch'
import { Controls } from '@/components/toolbar/controls'
import { SidebarToggle } from '@/components/toolbar/sidebar-toggle'
import { AiMagicIcon, ArrowLeft01Icon, ArrowRight01Icon, PanelRightIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { TabStrip } from './tab-strip'
import { useTabActions } from './tab-actions'
import { useWorkspace } from './tabs-store'
import { m } from '@/paraglide/messages'

/** The header of the centre column: the tabs, and the tools that belong to the
 * whole window, the assistant among them. It is the width of the content
 * beneath it, so it follows the sidebar folding and the right pillar opening.
 * On a prisoner's file one more button opens that person's details beside it. */
export function CenterHeader({ onRecord }: { onRecord: boolean }) {
  const { tabs, leftOpen, setLeftOpen, rightOpen, rightMode, toggleRight } = useWorkspace()
  const { cycle } = useTabActions()
  const hasSeveral = tabs.length > 1
  const assistantOpen = rightOpen && rightMode === 'assistant'

  return (
    <header data-tauri-drag-region className="relative flex h-12 shrink-0 items-center gap-1 bg-background/80 backdrop-blur-xl print:hidden">
      {/* With the sidebar folded, the window buttons and the sidebar button come here. */}
      {!leftOpen && (
        <div className="flex shrink-0 items-center gap-3 ps-4 pe-2">
          <Controls />
          <SidebarToggle open={false} onToggle={() => setLeftOpen(true)} />
        </div>
      )}

      <TabStrip />

      <nav aria-label={m.shell_window()} data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        <span className="shell-capsule">
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(-1)} aria-label={m.shell_previous_tab()} title={m.shell_previous_tab()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!hasSeveral} onClick={() => cycle(1)} aria-label={m.shell_next_tab()} title={m.shell_next_tab()} className="cursor-pointer">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
        </span>
        {import.meta.env.DEV && <DevRoleSwitch />}
        <span className="shell-capsule">
        <Button
          size="icon-sm"
          variant={assistantOpen ? 'secondary' : 'ghost'}
          onClick={() => toggleRight('assistant')}
          aria-label={m.shell_assistant()}
          aria-pressed={assistantOpen}
          title={m.shell_assistant()}
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={AiMagicIcon} className={assistantOpen ? 'size-4 text-primary' : 'size-4'} />
        </Button>
        {onRecord && (
        <Button
          size="icon-sm"
          variant={rightOpen && rightMode === 'record' ? 'secondary' : 'ghost'}
          onClick={() => toggleRight('record')}
          aria-label={m.shell_right_record()}
          aria-pressed={rightOpen && rightMode === 'record'}
          title={m.shell_right_record()}
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={PanelRightIcon} className="size-4" />
        </Button>
        )}
        </span>
      </nav>
    </header>
  )
}
