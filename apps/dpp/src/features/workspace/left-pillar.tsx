import { PanelLeftIcon } from '@hugeicons/core-free-icons'
import { productName } from '@/lib/jurisdiction'
import { BrandLogo } from '@/features/brand'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Navigator } from './navigator'
import { Ribbon } from './ribbon'
import { useWorkspace } from './tabs-store'
import * as m from '@/paraglide/messages'
import { useBrand } from '@/features/installation'

/** The left pillar: a full-height column with a header of its own, holding the
 * ribbon and the sidebar. The sidebar is `w-78` open and nothing folded; the
 * ribbon stays. The header is exactly as wide as ribbon plus sidebar, so the
 * brand sits over the ribbon's icons and the fold control over the sidebar. It
 * is sized `w-89` inside and clipped, so folding the sidebar hides the title
 * rather than squeezing it. */
export function LeftPillar() {
  const { leftOpen, setLeftOpen } = useWorkspace()
  const { data: brand } = useBrand()

  return (
    <div className="flex shrink-0 flex-col overflow-hidden border-r border-border/20 bg-background print:hidden">
      {/* `w-0 min-w-full`: as wide as the pillar, but adds nothing to how wide
          the pillar is, so the pillar is still ribbon plus sidebar. */}
      <header data-tauri-drag-region className="flex h-9 w-0 min-w-full shrink-0 items-center overflow-hidden border-b border-border/20 bg-background">
        <div data-tauri-drag-region className="flex w-89 shrink-0 items-center">
          <div data-tauri-drag-region className="flex w-11 shrink-0 items-center justify-center">
            <BrandLogo className="size-6" />
          </div>
          <div data-tauri-drag-region className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span data-tauri-drag-region className="truncate text-sm leading-4 font-semibold">{productName()}</span>
            <span data-tauri-drag-region className="truncate text-xs leading-3.5 text-muted-foreground">{brand?.officeName ?? m["workspace.tagline"]()}</span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setLeftOpen(false)}
            aria-label={m["workspace.hide_sidebar"]()}
            title={m["workspace.hide_sidebar"]()}
            inert={!leftOpen}
            className="mx-2 shrink-0 cursor-pointer"
          >
            <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Ribbon />
        <Navigator />
      </div>
    </div>
  )
}
