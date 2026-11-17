import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight02Icon, ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'

/** The arrow that ends a link: right for a page on this site, up-right for one that leaves it. */
export function LinkArrow({ external = false, className }: { external?: boolean; className?: string }) {
  return (
    <HugeiconsIcon
      icon={external ? ArrowUpRight01Icon : ArrowRight02Icon}
      aria-hidden="true"
      className={cn('ml-0.5 inline size-4 shrink-0 align-[-0.15em]', className)}
    />
  )
}
