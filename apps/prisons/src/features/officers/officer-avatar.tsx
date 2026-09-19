import { cn } from '@pleadli/ui/lib/utils'
import { officerInitials, type Officer } from './schema'

/** The officer's photo when one is set, otherwise their initials. */
export function OfficerAvatar({
  officer,
  size = 32,
  className,
}: {
  officer: Pick<Officer, 'name' | 'photoData'> | { name: string; photoData?: string | null }
  size?: number
  className?: string
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }
  return officer.photoData ? (
    <img src={officer.photoData} alt={officer.name} style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-label={officer.name}
      style={style}
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-medium text-primary', className)}
    >
      {officerInitials(officer.name)}
    </span>
  )
}
