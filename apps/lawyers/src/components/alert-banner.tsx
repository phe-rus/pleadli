import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

/** The strip at the top of Today for something that needs you now. The
 * same shape as the other Pleadli overviews: a pinging dot, a heading, a line,
 * and a link to where it is dealt with. */
export function AlertBanner({ tone, title, children, action }: { tone: 'urgent' | 'attention'; title: string; children: ReactNode; action?: ReactNode }) {
  const urgent = tone === 'urgent'
  return (
    <Card className={cn('p-0', urgent ? 'border-destructive/40 bg-destructive/5 dark:bg-destructive/10' : 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10')}>
      <CardContent className="flex flex-col items-start justify-between gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
        <div className="flex gap-2.5 md:items-center">
          <span className="relative flex size-2.5">
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', urgent ? 'bg-destructive' : 'bg-amber-400')} />
            <span className={cn('relative inline-flex size-2.5 rounded-full', urgent ? 'bg-destructive' : 'bg-amber-500')} />
          </span>
          <div className="flex flex-col md:flex-row md:items-center md:gap-3">
            <h3>{title}</h3>
            <span className="hidden md:block">·</span>
            <p>{children}</p>
          </div>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
