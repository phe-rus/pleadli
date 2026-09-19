import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'

/** Numbered circles joined by lines: the onboarding progress header. Steps
 * before `current` show a tick, the current one is filled, later ones are
 * outlined. */
export function StepsProgress({ steps, current, className }: { steps: readonly string[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex items-start', className)} aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className={cn('flex items-start', index < steps.length - 1 && 'flex-1')} aria-current={active ? 'step' : undefined}>
            <div className="flex w-16 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-primary/10 text-primary ring-4 ring-primary/10',
                  !done && !active && 'border-border text-muted-foreground',
                )}
              >
                {done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} /> : index + 1}
              </span>
              <span className={cn('text-center text-[11px] leading-tight', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {label}
              </span>
            </div>
            {index < steps.length - 1 && <span className={cn('mt-3.5 h-px flex-1 transition-colors', done ? 'bg-primary' : 'bg-border')} />}
          </li>
        )
      })}
    </ol>
  )
}
