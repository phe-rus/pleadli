import { cn } from '../lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/**
 * A grouped list, the way a Mac's System Settings and an iPhone's Settings
 * draw one: rows on one white rounded surface, separated by hairlines that
 * start after the icon, with a quiet title above and an optional note below.
 * Use it for anything that is a short list of things or settings.
 */
export function Group({ title, action, footer, className, children }: { title?: ReactNode; action?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section data-slot="group" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-1">
          {title && <h2 data-slot="group-title">{title}</h2>}
          {action}
        </div>
      )}
      <div data-slot="group-body" className="flex flex-col overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border/70">
        {children}
      </div>
      {footer && <p data-slot="group-footer" className="px-1 text-muted-foreground">{footer}</p>}
    </section>
  )
}

/**
 * One row of a group: an optional icon, the label (and a line under it), and
 * on the right a value, a control, or the chevron that says it opens
 * something. Pass `onClick` or render it as a link with `render` to make the
 * whole row the target.
 */
export function GroupRow({
  icon,
  label,
  detail,
  value,
  chevron,
  onClick,
  render,
  className,
  ...rest
}: {
  icon?: ReactNode
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  chevron?: boolean
  onClick?: () => void
  /** A link element to draw the row as (its children are replaced). */
  render?: (props: { className: string; children: ReactNode }) => ReactNode
  className?: string
} & Omit<ComponentProps<'div'>, 'onClick' | 'children'>) {
  const interactive = !!onClick || !!render
  const classes = cn(
    'group/row relative flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left no-underline text-foreground outline-none',
    // The hairline between rows starts after the icon, as on a Mac.
    'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border/70 last:after:hidden',
    icon && 'after:start-12',
    interactive && 'cursor-pointer transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04] active:bg-foreground/[0.06]',
    className,
  )
  const body = (
    <>
      {icon && <span className="flex size-6.5 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {detail && <span className="truncate text-[0.8125rem] text-muted-foreground">{detail}</span>}
      </span>
      {value !== undefined && <span className="flex shrink-0 items-center gap-2 text-muted-foreground">{value}</span>}
      {chevron && (
        <svg viewBox="0 0 8 14" aria-hidden className="h-3 w-2 shrink-0 fill-none stroke-muted-foreground/60 stroke-[1.6]">
          <path d="M1.5 1.5L6.5 7l-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )
  if (render) return <>{render({ className: classes, children: body })}</>
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    )
  return (
    <div className={classes} {...rest}>
      {body}
    </div>
  )
}

/** A row's icon: one quiet colour, no tinted square (the user turned those
 * down). `tone` is accepted so callers keep their meaning, and is not drawn,
 * except red for something overdue. */
export function RowIcon({ tone = 'gray', children }: { tone?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'teal'; children: ReactNode }) {
  return <span className={cn('flex size-6.5 items-center justify-center [&_svg]:size-4.5', tone === 'red' ? 'text-destructive' : 'text-muted-foreground')}>{children}</span>
}
