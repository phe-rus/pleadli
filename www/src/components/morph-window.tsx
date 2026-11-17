import { WifiOff02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Product } from '@/data/products'
import * as m from '@/paraglide/messages'

const tints = ['bg-primary/10 text-primary', 'bg-emerald-500/10 text-emerald-600', 'bg-amber-500/10 text-amber-600'] as const
const ease = [0.22, 1, 0.36, 1] as const

const group = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }
const piece = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease } } }

/** The one Pleadli window. Every app shares this shell, so the frame stays put and
 * only what differs between the apps changes: the name, the tabs, the navigator, the
 * figures and the accent. Sample records only, not a release screenshot. */
export function MorphWindow({ product, className }: { product: Product; className?: string }) {
  const reduce = useReducedMotion()
  const { mockup } = product
  const today = mockup.sections[0]?.items[0]
  const tabs = [today, mockup.tab].filter((tab, index, all) => tab && all.indexOf(tab) === index)
  const from = reduce ? false : 'hidden'

  return (
    <div
      className={cn(
        `product-tone-${product.slug}`,
        'overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground',
        'shadow-[0_32px_80px_-32px_rgba(0,0,0,0.38),0_2px_10px_-4px_rgba(0,0,0,0.18)]',
        className,
      )}
      style={{ '--accent-app': 'var(--product-accent)' } as React.CSSProperties}
    >
      <div className="flex h-10 items-stretch border-b border-border/70 bg-background">
        <div className="flex w-24 shrink-0 items-center gap-2 px-3 sm:w-48">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={product.slug}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.25 }}
            className="flex min-w-0 flex-1 items-end gap-0.5 px-1"
          >
            {tabs.map((tab) => (
              <span
                key={tab}
                className={cn(
                  'flex h-8 max-w-40 items-center truncate rounded-t-md px-3 text-xs',
                  tab === mockup.tab
                    ? 'border-b-2 border-(--accent-app) bg-muted/70 font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {tab}
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
        <span className="hidden items-center pr-3 text-xs text-muted-foreground sm:flex">
          <HugeiconsIcon icon={WifiOff02Icon} className="mr-1.5 size-3!" />
          {m['product.mock_local']()}
        </span>
      </div>

      <div className="grid aspect-4/3 grid-cols-[6rem_1fr] sm:aspect-[16/8.5] sm:grid-cols-[12rem_1fr]">
        <div className="flex flex-col gap-3 overflow-hidden border-r border-border/70 bg-muted/30 p-2 sm:p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={product.slug} variants={group} initial={from} animate="show" exit={{ opacity: 0, transition: { duration: 0.1 } }} className="flex flex-col gap-3">
              <motion.div variants={piece} className="flex items-center gap-2 px-1">
                <HugeiconsIcon icon={product.icon} className="size-4! shrink-0 text-(--accent-app)" />
                <div className="hidden min-w-0 flex-col leading-tight sm:flex">
                  <span className="truncate text-xs font-semibold">{product.name}</span>
                  <span className="truncate text-[0.65rem] text-muted-foreground">{mockup.statusLeft}</span>
                </div>
              </motion.div>
              {mockup.sections.map((section, si) => (
                <motion.div key={section.label} variants={piece} className="flex flex-col gap-0.5">
                  <span className="hidden px-2 text-[0.6rem] font-semibold tracking-wider text-muted-foreground/70 uppercase sm:block">
                    {section.label}
                  </span>
                  {section.items.map((item, ii) => (
                    <div
                      key={item}
                      className={cn(
                        'flex items-center justify-between gap-1 truncate rounded-md px-2 py-1 text-xs',
                        item === mockup.tab ? 'bg-(--accent-app)/12 font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('size-2.5 shrink-0 rounded-[3px] border', item === mockup.tab ? 'border-(--accent-app)' : 'border-muted-foreground/40')} />
                        <span className="truncate">{item}</span>
                      </span>
                      {si === 0 && ii === 1 && <span className="rounded-full bg-destructive/15 px-1.5 text-[0.6rem] text-destructive">2</span>}
                    </div>
                  ))}
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={product.slug}
              variants={group}
              initial={from}
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="flex flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-5"
            >
              <motion.div variants={piece} className="flex flex-col">
                <span className="truncate text-base font-bold sm:text-xl">{mockup.tab}</span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">{mockup.subtitle}</span>
              </motion.div>
              <motion.div variants={piece} className="grid grid-cols-3 gap-2 sm:gap-3">
                {mockup.stats.map((stat, index) => (
                  <div key={stat.label} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-2 sm:p-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full sm:size-5', tints[index % 3])}>
                        <span className="size-1.5 rounded-full bg-current" />
                      </span>
                      <span className="truncate text-[0.6rem] text-muted-foreground sm:text-xs">{stat.label}</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums sm:text-3xl">{stat.value}</span>
                  </div>
                ))}
              </motion.div>
              <motion.div variants={piece} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-2.5 sm:p-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold sm:text-sm">{mockup.row.title}</span>
                    <span className="truncate text-[0.65rem] text-muted-foreground sm:text-xs">{mockup.row.meta}</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-[0.65rem] font-medium text-destructive sm:text-xs">{mockup.row.pill}</span>
              </motion.div>
            </motion.div>
          </AnimatePresence>
          <div className="flex h-7 items-center justify-between gap-2 border-t border-border/70 px-3 text-[0.65rem] text-muted-foreground">
            <span className="truncate">{mockup.statusLeft}</span>
            <span className="shrink-0">{mockup.statusRight}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
