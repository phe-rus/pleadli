import { DevRoleSwitch } from '@/components/dev-role-switch'
import { useHqConfig } from '@/features/session'
import { Controls } from '@/components/toolbar/controls'
import { Toggletheme } from '@/components/toggle-theme'
import { PanelLeftIcon, PanelRightIcon, PrisonIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useWorkspace } from './tabs-store'

/** The top edge of the window: the app name left, and the window chrome
 * right (sidebars in and out, theme, the OS-style buttons). Content actions
 * do not live here — the ribbon and the sidebars own those. The bar is the
 * drag region in the desktop app. */
export function TitleBar() {
  const { contextOpen, setContextOpen, leftOpen, setLeftOpen } = useWorkspace()
  const { data: hqConfig } = useHqConfig()

  return (
    <header data-tauri-drag-region className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/20 bg-background px-2 pl-3">
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
        <span data-tauri-drag-region className="flex items-center gap-1.5 font-semibold tracking-wide">
          <HugeiconsIcon icon={PrisonIcon} className="size-4 text-primary" />
          <span className="text-sm">Pleadli Prisons</span>
        </span>
        <span data-tauri-drag-region className="hidden text-xs text-muted-foreground/70 sm:inline">
          · {hqConfig?.isHeadOffice ? 'Head Office network' : 'Facility node'}
        </span>
      </div>

      <nav data-tauri-drag-region className="flex items-center gap-0.5">
        <Button size="icon-sm" variant="ghost" onClick={() => setLeftOpen((prev) => !prev)} aria-label={leftOpen ? 'Hide sidebar' : 'Show sidebar'} title={leftOpen ? 'Hide sidebar' : 'Show sidebar'} className="size-7 cursor-pointer">
          <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setContextOpen((prev) => !prev)} aria-label={contextOpen ? 'Hide context panel' : 'Show context panel'} title={contextOpen ? 'Hide context panel' : 'Show context panel'} className="size-7 cursor-pointer">
          <HugeiconsIcon icon={PanelRightIcon} className="size-4" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border/40" aria-hidden />
        {import.meta.env.DEV && <DevRoleSwitch />}
        <Toggletheme />
        <Controls />
      </nav>
    </header>
  )
}