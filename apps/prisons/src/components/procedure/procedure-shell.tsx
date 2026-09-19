import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export type ProcedureStep = {
  id: string
  label: string
  /** One line under the label, for example what was decided in this step. */
  summary?: string | null
  done?: boolean
  optional?: boolean
}

type ProcedureShellProps = {
  title: string
  description?: string
  /** Where the officer goes to abandon the procedure. */
  backTo: string
  backLabel: string
  steps: readonly ProcedureStep[]
  current: string
  onSelect: (id: string) => void
  /** Shown as a slim summary bar under the steps: the person, flags, anything that must stay in view. */
  aside?: ReactNode
  children: ReactNode
}

/**
 * The guided-procedure layout (docs/prisons/product-map/08 1.5): a horizontal
 * steps progress on top, the current step in a card below. Reception,
 * discharge and transfer share it so the work looks the same wherever an
 * officer performs it. Every step can be revisited at any time.
 */
export function ProcedureShell({ title, description, backTo, backLabel, steps, current, onSelect, aside, children }: ProcedureShellProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  )

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="mx-auto flex w-full flex-col gap-1 md:max-w-3xl">
        <Link to={backTo as never} className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
          {backLabel}
        </Link>
        <h1>{title}</h1>
        {description && <p className="md:max-w-xl">{description}</p>}
      </section>

      <nav aria-label={`${title} steps`} className="mx-auto w-full md:max-w-3xl">
        <ol className="flex items-start">
          {steps.map((step, index) => {
            const active = index === currentIndex
            const passed = index < currentIndex
            return (
              <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {index < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn('absolute top-[13px] left-[calc(50%+16px)] h-0.5 w-[calc(100%-32px)] rounded-full transition-colors', passed || step.done ? 'bg-primary' : 'bg-border')}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${step.label}${step.optional ? ' (optional)' : ''}${step.done ? ', done' : ''}`}
                  className="group relative flex flex-col items-center gap-1.5 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                      step.done || passed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground group-hover:border-primary/50',
                      active && 'border-primary ring-4 ring-primary/20',
                      active && !step.done && !passed && 'text-primary',
                    )}
                  >
                    {step.done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'max-w-[7rem] text-center text-[11px] leading-tight',
                      active ? 'font-medium text-foreground' : 'hidden text-muted-foreground md:block',
                    )}
                  >
                    {step.label}
                    {step.optional && <span className="block text-[10px] font-normal text-muted-foreground">optional</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {aside && <div className="mx-auto w-full md:max-w-3xl">{aside}</div>}

      <Card className="mx-auto w-full md:max-w-3xl">
        <CardContent className="flex flex-col gap-5 py-5">
          {children}
        </CardContent>
      </Card>
    </article>
  )
}
