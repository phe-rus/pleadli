import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export type Tone = 'open' | 'waiting' | 'done' | 'stopped' | 'urgent' | 'planned' | 'neutral'

/** Semantic tags. The word carries the meaning and the colour repeats it, so
 * nothing depends on telling two colours apart: `open` needs an officer,
 * `waiting` is with someone else, `done` is settled, `stopped` ended, `urgent`
 * is past a limit the record itself fixes (the custody deadline), `planned` is
 * not built yet. */
const tones: Record<Tone, string> = {
  open: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  waiting: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  stopped: 'bg-muted text-muted-foreground',
  urgent: 'bg-destructive/10 text-destructive',
  planned: 'border-dashed border-border bg-transparent text-muted-foreground',
  neutral: 'bg-secondary text-secondary-foreground',
}

export function Tag({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="ghost" className={cn('font-medium', tones[tone], className)}>
      {children}
    </Badge>
  )
}
