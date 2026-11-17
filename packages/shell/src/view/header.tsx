import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import type { ReactNode } from 'react'

export type HeaderLabels = { window: string; previousTab: string; nextTab: string; previousTabWith: string; nextTabWith: string }

/** The header of the centre column, translucent over the page: the tabs, then
 * the few things that belong to the whole window. With the sidebar folded the
 * window buttons come here (`leading`). */
export function HeaderView({ leading, tabs, end, labels, canCycle, onCycle }: { leading?: ReactNode; tabs: ReactNode; end?: ReactNode; labels: HeaderLabels; canCycle: boolean; onCycle: (delta: 1 | -1) => void }) {
  return (
    <header data-tauri-drag-region className="relative flex h-12 shrink-0 items-center gap-1 bg-background/80 backdrop-blur-xl print:hidden">
      {leading && <div className="flex shrink-0 items-center gap-3 ps-4 pe-2">{leading}</div>}
      {tabs}
      <nav aria-label={labels.window} data-tauri-drag-region className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
        {end}
        <span className="shell-capsule">
          <Button size="icon-sm" variant="ghost" disabled={!canCycle} onClick={() => onCycle(-1)} aria-label={labels.previousTab} title={labels.previousTabWith} className="cursor-pointer">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={!canCycle} onClick={() => onCycle(1)} aria-label={labels.nextTab} title={labels.nextTabWith} className="cursor-pointer">
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </span>
      </nav>
    </header>
  )
}
