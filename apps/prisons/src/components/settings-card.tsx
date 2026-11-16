import { cn } from '@pleadli/ui/lib/utils'
import { useId, type FormEventHandler, type ReactNode } from 'react'

/** One group of settings, drawn as System Settings draws one: a quiet title
 * and a line of purpose above, the rows on one white rounded surface split by
 * hairlines, the button in the last row on the right, and any note in grey
 * under the surface. No tinted bars, no boxes inside the box.
 *
 * Text is plain semantic tags (`h3`, `p`) so the global typography styles it;
 * the group sets only layout and colour. Give `onSubmit` and the group is the
 * `<form>`, so its button submits it. */
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
  /** Under the group, in grey: what the action will do, or what it cannot. */
  hint?: ReactNode
  /** The last row, on the right: the one button for this group. */
  action?: ReactNode
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** A destructive group: its surface takes the destructive colour. */
  danger?: boolean
  children?: ReactNode
  className?: string
}) {
  const Root = onSubmit ? 'form' : 'section'
  return (
    <Root onSubmit={onSubmit} className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {(title || description) && (
        <div className="flex flex-col gap-0.5 px-1">
          {title && (
            <div className="flex flex-wrap items-center gap-2">
              <h3 data-slot="group-title">{title}</h3>
              {badge}
            </div>
          )}
          {description && <p className="text-[0.8125rem] text-muted-foreground">{description}</p>}
        </div>
      )}
      {(children || action) && (
        <div
          className={cn(
            'flex flex-col overflow-hidden rounded-xl bg-card shadow-xs ring-1',
            // Every direct child is a row: the same inset, a hairline between.
            'divide-y divide-border/60 [&>*]:px-4 [&>*]:py-3',
            // A shared form field inside a group reads as a row too: name left, control right.
            'sm:[&>[data-slot=field]]:grid sm:[&>[data-slot=field]]:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:[&>[data-slot=field]]:items-center sm:[&>[data-slot=field]]:gap-x-6',
            danger ? 'ring-destructive/40' : 'ring-border/70',
          )}
        >
          {children}
          {action && <div className="flex items-center justify-end gap-2 py-2.5!">{action}</div>}
        </div>
      )}
      {hint && <div className="px-1 text-[0.8125rem] text-muted-foreground">{hint}</div>}
    </Root>
  )
}

/** One setting as a row of a group: its name (and a grey line under it) on
 * the left, the control on the right at a compact width. Stacks on a narrow
 * window. Pass a function as `children` to get the id the label points at. */
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
