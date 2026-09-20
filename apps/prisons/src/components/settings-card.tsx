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
  return (
    <Root
      onSubmit={onSubmit}
      className={cn('flex w-full flex-col overflow-hidden rounded-lg border bg-card', danger ? 'border-destructive/40' : 'border-border', className)}
    >
      {(title || description || children) && (
        <div className="flex flex-col gap-4 p-4">
          {(title || description) && (
            <div className="flex flex-col gap-1">
              {title && (
                <div className="flex flex-wrap items-center gap-2">
                  <h3>{title}</h3>
                  {badge}
                </div>
              )}
              {description && <p>{description}</p>}
            </div>
          )}
          {children}
        </div>
      )}
      {hasFooter && (
        <footer className={cn('flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3', danger ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40')}>
          <div className="min-w-0 flex-1">{hint}</div>
          {action}
        </footer>
      )}
    </Root>
  )
}
