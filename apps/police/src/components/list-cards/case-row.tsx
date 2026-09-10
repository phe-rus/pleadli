import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'

export type CaseRowData = {
  reference: string
  title: string
  status: string
  statusLabel: string
  subtitle: string
}

const statusVariant: Record<string, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  open: 'default',
  closed: 'secondary',
}

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
        'flex items-center justify-between cursor-pointer gap-3',
        'rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60',
        className,
      )}
    >
      <div className="min-w-0">
        <div className='text-xs truncate'>{row.title}</div>
        <p className="text-xs">
          {row.reference} · {row.subtitle}
        </p>
      </div>
      <Badge
        className="shrink-0 text-[0.625rem]!"
        variant={statusVariant[row.status] ?? 'outline'}
      >
        {row.statusLabel}
      </Badge>
    </article>
  )
}