import type { CaseRow as CaseRowData } from '@/data/overview'
import { Avatar, AvatarFallback } from '@pleadli/ui/avatar'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'

const statusVariant = {
  Open: 'secondary',
  'In progress': 'default',
  'Waiting referral': 'outline',
  Returned: 'destructive',
} as const

export type CaseRowProps = {
  row: CaseRowData
  onClick?: () => void
  className?: string
}

export const CaseRow = ({
  row,
  onClick,
  className
}: CaseRowProps) => {
  return (
    <article
      onClick={onClick}
      className={cn(
        'flex items-center justify-between cursor-pointer',
        'rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="bg-muted text-[0.625rem]">{row.officer}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className='text-xs truncate'>{row.title}</h1>
          <p className="text-xs">
            {row.reference} · updated {row.updated}
          </p>
        </div>
      </div>
      <Badge
        className="shrink-0 text-[0.625rem]!"
        variant={statusVariant[row.status]}
      >
        {row.status}
      </Badge>
    </article>
  )
}