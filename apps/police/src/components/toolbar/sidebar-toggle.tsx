import { cn } from '@pleadli/ui/lib/utils'
import * as m from '@/paraglide/messages'

/** The sidebar button as a Mac draws it: a thin window outline with its left
 * pane marked, quiet until the pointer is on it. */
export function SidebarToggle({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
  const label = open ? m["workspace.hide_sidebar"]() : m["workspace.show_sidebar"]()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      title={label}
      className={cn('flex h-7 w-8 shrink-0 cursor-default items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', className)}
    >
      <svg viewBox="0 0 20 16" className="h-4 w-5 fill-none stroke-current stroke-[1.3]" aria-hidden>
        <rect x="1.65" y="1.65" width="16.7" height="12.7" rx="2.6" />
        <path d="M7.25 1.8v12.4" />
        <path d="M3.6 5h1.8M3.6 7.4h1.8M3.6 9.8h1.8" strokeLinecap="round" />
      </svg>
    </button>
  )
}
