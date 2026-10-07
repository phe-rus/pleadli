import { cn } from '../lib/utils'
import type { ReactNode } from 'react'

/**
 * One number worth knowing, the way Health and Screen Time show one: a small
 * label, the figure large, and a line of context. Tone colours the figure
 * only when it asks for action.
 */
export function Stat({ label, value, hint, tone = 'plain', onClick, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'plain' | 'attention' | 'urgent' | 'good'; onClick?: () => void; className?: string }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-xl bg-card px-4 py-3 text-left shadow-xs ring-1 ring-border/70',
        onClick && 'cursor-pointer transition-shadow hover:shadow-sm',
        className,
      )}
    >
      <span className="truncate text-[0.8125rem] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-[1.625rem] leading-tight font-semibold tracking-tight tabular-nums',
          tone === 'attention' && 'text-amber-600 dark:text-amber-400',
          tone === 'urgent' && 'text-destructive',
          tone === 'good' && 'text-green-600 dark:text-green-400',
        )}
      >
        {value}
      </span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </Tag>
  )
}
