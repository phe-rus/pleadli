import { Card } from '@pleadli/ui/card'
import { Badge } from '@pleadli/ui/badge'
import type { Product } from '@/data/products'
import { WifiOff02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { cn } from 'cn'

const tileTints = ['bg-primary/10 text-primary', 'bg-emerald-500/10 text-emerald-600', 'bg-amber-500/10 text-amber-600'] as const

/** Shared illustration using sample records. It is not a release screenshot. */
export function ProductMockup({ product }: { product: Product }) {
  const { mockup } = product
  const today = mockup.sections[0]?.items[0]
  return (
    <Card className="w-full gap-0 overflow-hidden rounded-2xl p-0 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.3)]">
      {/* Title bar: mark, name and office on the left, tabs, theme on the right. */}
      <div className="flex h-9 items-stretch border-b bg-background">
        <div className="flex w-[92px] shrink-0 items-center gap-2 px-2.5 sm:w-[180px]">
          <HugeiconsIcon icon={product.icon} className="size-4! shrink-0 text-primary" />
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[0.7rem] font-semibold">{product.name}</span>
            <span className="truncate text-[0.6rem] text-muted-foreground">{mockup.statusLeft}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-0.5 px-1">
          {[today, mockup.tab].filter((t, i, a) => t && a.indexOf(t) === i).map((t) => (
            <span
              key={t}
              className={cn(
                'flex h-7 max-w-[9rem] items-center truncate rounded-t-md px-2.5 text-[0.65rem]',
                t === mockup.tab ? 'border-b-2 border-primary bg-muted/60 font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <span className="hidden items-center pr-3 text-[0.6rem] text-muted-foreground sm:flex">
          <HugeiconsIcon icon={WifiOff02Icon} className="mr-1 size-2.5!" />
          {m["product.mock_local"]()}
        </span>
      </div>

      <div className="aspect-4/3 sm:aspect-video">
        <div className="grid h-full grid-cols-[92px_1fr] sm:grid-cols-[180px_1fr]">
          {/* Navigator. */}
          <div className="flex flex-col gap-2 overflow-hidden border-r bg-muted/20 p-1.5 sm:gap-2.5 sm:p-2">
            <div className="hidden h-6 items-center rounded-md border border-border/60 bg-background px-2 text-[0.6rem] text-muted-foreground sm:flex">{m["product.mock_search"]()}</div>
            {mockup.sections.map((section, si) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="hidden items-center justify-between px-1.5 text-[0.55rem] font-semibold tracking-wider text-muted-foreground/70 uppercase sm:flex">
                  {section.label}
                  <span aria-hidden>⌄</span>
                </span>
                {section.items.map((item, ii) => (
                  <div
                    key={item}
                    className={cn(
                      'flex items-center justify-between gap-1 truncate rounded-md px-1.5 py-1 text-[0.65rem] sm:px-2',
                      item === mockup.tab ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('size-2.5 shrink-0 rounded-[3px] border', item === mockup.tab ? 'border-primary/60' : 'border-muted-foreground/40')} />
                      <span className="truncate">{item}</span>
                    </span>
                    {si === 0 && ii === 1 && <span className="rounded-full bg-destructive/15 px-1 text-[0.55rem] text-destructive">2</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* The page in view. */}
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-1 flex-col gap-2.5 overflow-hidden p-2.5 sm:gap-3 sm:p-4">
              <div className="flex flex-col">
                <span className="truncate text-sm font-bold sm:text-lg">{mockup.tab}</span>
                <span className="hidden truncate text-[0.65rem] text-muted-foreground sm:block">{mockup.subtitle}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {mockup.stats.map((stat, i) => (
                  <div key={stat.label} className="flex flex-col gap-1 rounded-lg border bg-card p-1.5 sm:p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full sm:size-5', tileTints[i % 3])}>
                        <span className="size-1.5 rounded-full bg-current" />
                      </span>
                      <span className="truncate text-[0.55rem] text-muted-foreground sm:text-[0.65rem]">{stat.label}</span>
                    </div>
                    <span className="text-base font-semibold tabular-nums sm:text-2xl">{stat.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 sm:p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[0.7rem] font-semibold sm:text-sm">{mockup.row.title}</span>
                    <span className="truncate text-[0.6rem] text-muted-foreground sm:text-xs">{mockup.row.meta}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 bg-destructive/10 text-destructive">{mockup.row.pill}</Badge>
              </div>
            </div>
            {/* Status bar. */}
            <div className="flex h-6 items-center justify-between gap-2 border-t px-2.5 text-[0.55rem] text-muted-foreground sm:text-[0.6rem]">
              <span className="truncate">{mockup.statusLeft}</span>
              <span className="shrink-0">{mockup.statusRight}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}


