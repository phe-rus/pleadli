import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { useId, type ReactNode } from 'react'

/** One row in a settings group: the label (and a grey hint) on the left, the
 * value or control on the right. */
export function SettingsRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode | ((id: string) => ReactNode) }) {
  const id = useId()
  return (
    <div className="grid grid-cols-1 items-center gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id}>{label}</label>
        {hint && <p className="text-[0.8125rem] text-muted-foreground">{hint}</p>}
      </div>
      {typeof children === 'function' ? (
        <div className="flex min-w-0 flex-col sm:items-end">{children(id)}</div>
      ) : (
        <div id={id} className="flex min-w-0 flex-col sm:items-end">
          {children}
        </div>
      )}
    </div>
  )
}

type Tone = 'open' | 'waiting' | 'done' | 'urgent'

const tones: Record<Tone, string> = {
  open: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  waiting: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  urgent: 'bg-destructive/10 text-destructive',
}

/** A status chip: the word carries the meaning, the colour repeats it. */
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant="ghost" className={cn('font-medium', tones[tone])}>
      {children}
    </Badge>
  )
}
