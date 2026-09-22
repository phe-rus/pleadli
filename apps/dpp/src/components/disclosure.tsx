import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

/** The folding part of a disclosure: a panel that opens and closes by
 * animating its row height, with nothing in it reachable while closed.
 * Motion is a short CSS transition and stops under reduced motion. The caller
 * owns the state and the button that toggles it (`aria-controls` this `id`). */
export function Disclosure({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} className={cn('grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
      <div inert={!open} className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
