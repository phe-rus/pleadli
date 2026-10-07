import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import type { ComponentProps } from 'react'

/** A choice from a short list, drawn like the site's text fields with a soft
 * chevron, over the browser's own control so phones keep their native picker. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full', className)}>
      <select
        {...props}
        className={cn(
          'h-(--control-h) w-full cursor-pointer appearance-none rounded-md border border-input bg-input/20 ps-(--control-px) pe-9 text-sm transition-colors outline-none',
          'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-(length:--ui-text) dark:bg-input/30',
        )}
      >
        {children}
      </select>
      <HugeiconsIcon icon={ArrowDown01Icon} className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
