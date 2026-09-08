import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export type ChartBlockProps = {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export const ChartBlock = ({
  title,
  description,
  className,
  children
}: ChartBlockProps) => {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-col">
        <h1>{title}</h1>
        {description ? <p className='text-xs'>{description}</p> : null}
      </div>
      <span className='border-t border-border/60' />
      {children}
    </div>
  )
}