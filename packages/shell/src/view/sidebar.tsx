import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

/** One place in the sidebar. The one in view is a soft tinted pill; a count
 * sits quietly at the end, and turns red only when something is overdue. */
export function SidebarRow({ icon, label, active, onOpen, onWarm, count, urgent = false }: { icon: IconSvgElement; label: string; active: boolean; onOpen: () => void; /** Called when the pointer arrives or presses, so the page can start loading before the click lands. */ onWarm?: () => void; count?: number; urgent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={onWarm}
      onPointerDown={onWarm}
      onFocus={onWarm}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7.5 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] outline-none transition-colors duration-(--shell-motion-hover) focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        active ? 'bg-primary/12 font-medium text-foreground' : 'text-sidebar-foreground hover:bg-foreground/5',
      )}
    >
      <HugeiconsIcon icon={icon} className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <span className={cn('shrink-0 text-xs tabular-nums', urgent ? 'rounded-full bg-destructive px-1.5 leading-4 font-semibold text-white' : 'text-muted-foreground')}>{count > 999 ? '999+' : count}</span>
      )}
    </button>
  )
}

/** One folding group, titled the way a Mac sidebar titles its groups: small,
 * quiet, and the fold arrow only when the pointer is near. */
export function SidebarSection({ id, label, open, onToggle, children }: { id: string; label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="group/section flex flex-col pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`section-${id}`}
        onClick={onToggle}
        className="flex h-6 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-[0.6875rem] font-semibold text-muted-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {label}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn('size-3.5 shrink-0 opacity-0 transition duration-150 group-hover/section:opacity-100 motion-reduce:transition-none', !open && '-rotate-90 opacity-100')}
        />
      </button>
      <div id={`section-${id}`} className={cn('grid transition-[grid-template-rows] duration-(--shell-motion-panel) ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-px pt-0.5">{children}</div>
        </div>
      </div>
    </section>
  )
}

/** The left pillar: the sidebar running the full height of the window on its
 * own quiet grey. Its top is the window's title bar (`controls`); folding it
 * hides it entirely. */
export function PillarView({ open, label, controls, brand, top, children, footer }: { open: boolean; label: string; controls: ReactNode; brand: ReactNode; top?: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <div inert={!open} data-open={open} className={cn('shell-sidebar flex shrink-0 flex-col overflow-hidden bg-sidebar print:hidden', open ? 'border-r border-sidebar-border' : 'w-0')}>
      <header data-tauri-drag-region className="flex h-12 w-0 min-w-full shrink-0 items-center overflow-hidden">
        <div data-tauri-drag-region className="flex w-64 shrink-0 items-center gap-3 ps-4 pe-2">
          {controls}
        </div>
      </header>
      <div data-tauri-drag-region className="flex w-64 shrink-0 items-center gap-2.5 px-4 pt-1 pb-3">
        {brand}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside aria-label={label} inert={!open} className="min-h-0 w-64 shrink-0 overflow-hidden print:hidden">
          <div className="flex h-full w-64 flex-col">
            {top}
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">{children}</div>
            {footer}
          </div>
        </aside>
      </div>
    </div>
  )
}
