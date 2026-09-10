import { cn } from '@pleadli/ui/lib/utils'

const severityDot = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-muted-foreground/60',
} as const

export type AttentionItemData = {
  label: string
  detail: string
  time: string
  severity: keyof typeof severityDot
}

export type AttentionItemProps = {
  item: AttentionItemData
  className?: string
}

export const AttentionItem = ({
  item,
  className
}: AttentionItemProps) => {
  return (
    <article className={cn('flex items-start gap-3', className)}>
      <span
        className={cn(
          'mt-[0.45rem] size-2 shrink-0 rounded-full',
          severityDot[item.severity],
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <div className="flex items-baseline justify-between gap-3">
          <div className='text-sm truncate'>{item.label}</div>
          <p className="shrink-0 text-xs text-muted-foreground">{item.time}</p>
        </div>
        <p className="text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </article>
  )
}