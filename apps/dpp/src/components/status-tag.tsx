import { fileStatusLabel, fileStatusTone, type StatusTone } from '@/features/prosecution-files/schema'
import { Badge } from '@pleadli/ui/badge'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export type Tone = StatusTone | 'urgent' | 'planned' | 'neutral'

/** Semantic tags. The word carries the meaning and the colour repeats it, so
 * nothing depends on telling two colours apart: `open` needs the prosecutor,
 * `waiting` is with someone else, `done` is settled, `stopped` ended without a
 * charge, `urgent` is past a date the record itself fixes, `planned` is not
 * built yet. */
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

/** While the file is still being received or read, "awaiting a decision" would
 * say more than is true: the prosecutor has not got to deciding yet. */
export function FileStatusTag({ status, stage }: { status: string; stage?: string }) {
  if (status === 'under_review' && (stage === 'receive' || stage === 'review')) return <Tag tone="open">{m["file_ws.status_reading"]()}</Tag>
  return <Tag tone={fileStatusTone(status)}>{fileStatusLabel(status)}</Tag>
}
