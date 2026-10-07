import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useId, type ReactNode } from 'react'

/** A large, calm choice: the whole card is the target. */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  body,
  badge,
  disabled,
  children,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  body?: ReactNode
  badge?: ReactNode
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all outline-none',
        'hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50',
        selected ? 'border-primary ring-1 ring-primary shadow-sm' : 'border-border',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <strong>{title}</strong>
          {badge}
        </span>
        {body && <span className="text-muted-foreground">{body}</span>}
        {children}
      </span>
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        className={cn('mt-0.5 size-5 shrink-0 transition-opacity', selected ? 'text-primary opacity-100' : 'opacity-0')}
      />
    </button>
  )
}

export function Chip({ tone = 'muted', children }: { tone?: 'muted' | 'good' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap',
        tone === 'good' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        tone === 'warn' && 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

/** A labelled input with its hint and error under it. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: React.ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id}>{label}</label>
      <Input id={id} className="h-10 rounded-lg px-3" aria-invalid={error ? true : undefined} {...input} />
      {error ? (
        <p role="alert" className="not-typeset text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export function StepHeader({ title, lead }: { title: ReactNode; lead?: ReactNode }) {
  return (
    // Centred, as each step of a Mac's Setup Assistant is: the title, then one quiet line.
    <header className="flex flex-col items-center gap-2 pb-8 text-center">
      <h1>{title}</h1>
      {lead && <p className="max-w-md text-muted-foreground">{lead}</p>}
    </header>
  )
}
