import { cn } from '@pleadli/ui/lib/utils'
import type { FormEventHandler, ReactNode } from 'react'

/** One group of settings, in the shape Vercel, GitHub and Claude share: a
 * bordered card with a title and a line of purpose, the controls, and a
 * footer that holds a hint on the left and the action on the right.
 *
 * Text is plain semantic tags (`h3`, `p`) so the global typography styles it;
 * the card sets only layout and colour. Give `onSubmit` and the card is the
 * `<form>`, so its footer button submits it. */
export function SettingsCard({
  title,
  badge,
  description,
  hint,
  action,
  onSubmit,
  danger,
  children,
  className,
}: {
  title?: string
  /** Beside the title: a status chip such as where the value came from. */
  badge?: ReactNode
  description?: ReactNode
  /** Left of the footer: what the action will do, or what it cannot. */
  hint?: ReactNode
  /** Right of the footer: the one button for this card. */
  action?: ReactNode
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** A destructive group: the border and footer take the destructive colour. */
  danger?: boolean
  children?: ReactNode
  className?: string
}) {
  const Root = onSubmit ? 'form' : 'section'
  const hasFooter = hint != null || action != null
  // A card with nothing inside but its action is one row: the words on the
  // left, the button on the right, as a browser's settings list them.
  const single = !children && hasFooter
  return (
    <Root onSubmit={onSubmit} className={cn('relative flex w-full flex-col gap-2', className)}>
      {(title || badge) && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {title && <h3 className={cn(danger && 'text-destructive')}>{title}</h3>}
          {badge}
        </div>
      )}
      <div className={cn('overflow-hidden rounded-xl border bg-card shadow-xs', danger ? 'border-destructive/40' : 'border-border/70')}>
        {single ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {description && <p className="text-foreground">{description}</p>}
              {hint && <div className="text-muted-foreground">{hint}</div>}
            </div>
            <div className="shrink-0">{action}</div>
          </div>
        ) : (
          <>
            {(description || children) && (
              <div className="flex flex-col gap-4 px-4 py-4">
                {description && <p className="text-muted-foreground">{description}</p>}
                {children}
              </div>
            )}
            {hasFooter && (
              <footer className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 py-2.5', danger ? 'border-destructive/30' : 'border-border/60')}>
                <div className="min-w-0 flex-1 text-muted-foreground">{hint}</div>
                {action}
              </footer>
            )}
          </>
        )}
      </div>
    </Root>
  )
}
