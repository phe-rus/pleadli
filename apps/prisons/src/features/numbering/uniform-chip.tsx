import { cn } from '@pleadli/ui/lib/utils'
import { uniformColour, uniformCategoryLabel } from './schema'
import { useNumbering } from './queries'

/** The uniform colour of a prisoner's category, as set in Settings. Renders
 * nothing while no colour has been set, so an unset scheme never shows a guess. */
export function UniformChip({ status, className }: { status: string; className?: string }) {
  const { data } = useNumbering()
  const entry = data?.uniforms.find((u) => u.category === status)
  const colour = uniformColour(entry?.colour)
  if (!entry || !colour) return null
  const text = entry.label?.trim() || `${colour.label} uniform`
  return (
    <span
      title={`${uniformCategoryLabel(status)}: ${text}`}
      className={cn('inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground', className)}
    >
      <span className={cn('size-2.5 rounded-full ring-1 ring-border', colour.dot)} />
      {text}
    </span>
  )
}
