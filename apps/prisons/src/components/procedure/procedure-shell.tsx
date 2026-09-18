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
  /** Shown under the step list: the person, flags, anything that must stay in view. */
  aside?: ReactNode
  children: ReactNode
}

/**
 * The guided-procedure layout (docs/prisons/product-map/08 1.5): the steps on
 * the left, the current step on the right. Reception, discharge and transfer
 * share it so the work looks the same wherever an officer performs it.
 */
export function ProcedureShell({ title, description, backTo, backLabel, steps, current, onSelect, aside, children }: ProcedureShellProps) {
  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <Link to={backTo as never} className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
          {backLabel}
        </Link>
        <h1>{title}</h1>
        {description && <p className="md:max-w-xl">{description}</p>}
      </section>

      <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1">
            {steps.map((step, index) => {
              const active = step.id === current
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(step.id)}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/60',
                      active && 'border-primary/30 bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                        step.done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600' : 'border-border text-muted-foreground',
                        active && !step.done && 'border-primary text-primary',
                      )}
                    >
                      {step.done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} /> : index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className={cn('text-sm', active ? 'font-medium text-foreground' : 'text-foreground/80')}>
                        {step.label}
                        {step.optional && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">optional</span>}
                      </span>
                      {step.summary && <span className="truncate text-xs text-muted-foreground">{step.summary}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {aside}
        </aside>

        <Card>
          <CardContent className="flex flex-col gap-5 py-5">{children}</CardContent>
        </Card>
      </div>
    </article>
  )
}
