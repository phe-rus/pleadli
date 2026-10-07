import { cn } from '../lib/utils'
import type { ReactNode } from 'react'

export type SegmentedItem<T extends string> = { value: T; label: ReactNode; count?: number }

/**
 * A Mac segmented control: two to five choices that switch what one view
 * shows. The chosen one is lifted onto white. For choices that change the
 * address, render each segment as a link with `render`.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md',
  render,
  className,
}: {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange?: (value: T) => void
  label: string
  size?: 'sm' | 'md'
  render?: (item: SegmentedItem<T>, props: { className: string; 'aria-selected': boolean; role: 'tab'; children: ReactNode }) => ReactNode
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex rounded-[0.625rem] bg-foreground/[0.055] p-0.5', className)}>
      {items.map((item) => {
        const active = item.value === value
        const props = {
          role: 'tab' as const,
          'aria-selected': active,
          className: cn(
            'flex items-center justify-center gap-1.5 rounded-lg no-underline transition-all duration-150 motion-reduce:transition-none',
            size === 'md' ? 'min-w-24 px-4 py-1 text-[0.8125rem]' : 'min-w-16 px-3 py-0.5 text-xs',
            active ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-black/5 dark:bg-foreground/15' : 'cursor-pointer text-muted-foreground hover:text-foreground',
          ),
          children: (
            <>
              {item.label}
              {item.count ? <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span> : null}
            </>
          ),
        }
        if (render) return <span key={item.value} className="contents">{render(item, props)}</span>
        return (
          <button key={item.value} type="button" {...props} onClick={() => onChange?.(item.value)} />
        )
      })}
    </div>
  )
}
