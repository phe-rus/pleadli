import type { ReactNode } from 'react'
import { cn } from '@pleadli/ui/lib/utils'

export type ResultGroupProps = {
  title: string
  count: number
  children: ReactNode
  className?: string
}

export const ResultGroup = ({ title, count, children, className }: ResultGroupProps) => {
  return (
    <div className={cn('flex min-w-0 flex-col gap-5', className)}>
      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-5">
        <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-[0.625rem] text-muted-foreground">
          {count} {count === 1 ? 'match' : 'matches'}
        </span>
      </div>
      {children}
    </div>
  )
}