import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { useRef, useState } from 'react'
import { getProducts } from '@/data/products'
import { productPresentation } from '@/data/product-presentation'

const wrap = 'container w-full md:max-w-6xl'
/** Screen heights of scrolling given to each app while the section is pinned. */
const PER_APP = 0.7

function Tabs({ active, onPick, prefix }: { active: number; onPick: (index: number) => void; prefix: string }) {
  const products = getProducts()
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {products.map((entry, index) => (
        <button
          key={entry.slug}
          type="button"
          role="tab"
          id={`${prefix}-tab-${entry.slug}`}
          aria-selected={active === index}
          aria-controls={`${prefix}-panel`}
          onClick={() => onPick(index)}
          className={cn(
            'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === index ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <HugeiconsIcon icon={entry.icon} className="size-4!" />
          {entry.name}
        </button>
      ))}
    </div>
  )
}

function Panel({ slug, prefix }: { slug: string; prefix: string }) {
  const reduce = useReducedMotion()
  const product = getProducts().find((entry) => entry.slug === slug) ?? getProducts()[0]
  return (
    <div id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-tab-${slug}`} className="min-h-72">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={slug}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-14"
        >
          <p className="text-lg! leading-relaxed text-muted-foreground">{productPresentation(slug).lead}</p>
          <ul className="m-0 grid list-none gap-x-10 gap-y-4 p-0 sm:grid-cols-2">
            {product.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-base">
                <HugeiconsIcon icon={Tick02Icon} className="mt-1 size-4! shrink-0 text-primary-ink" />
                {feature}
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Every feature of every app. On a wide screen the section stays pinned and the app changes as the page
 * scrolls, with a bar showing how far through the five it is; a tab still jumps straight to its app.
 * On a narrow screen, or for anyone who asks for less motion, it is plain tabs. */
export function FeatureShowcase({ title }: { title: string }) {
  const products = getProducts()
  const count = products.length
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next = Math.min(count - 1, Math.max(0, Math.floor(value * count)))
    setActive((current) => (current === next ? current : next))
  })

  const jump = (index: number) => {
    const el = track.current
    if (!el) return setActive(index)
    const scrollable = el.offsetHeight - window.innerHeight
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + ((index + 0.5) / count) * scrollable, behavior: reduce ? 'auto' : 'smooth' })
  }

  const slug = products[active].slug
  return (
    <section className="border-t border-border/60 bg-muted/60" aria-labelledby="features-title">
      {/* Wide screens: pinned, driven by scroll. */}
      <div ref={track} className={cn(reduce ? 'hidden' : 'hidden md:block')} style={{ height: `${(count * PER_APP + 0.5) * 100}dvh` }}>
        <div className="sticky top-14 flex h-[calc(100dvh-3.5rem)] items-center">
          <div className={cn(wrap, 'flex flex-col gap-8')}>
            <h2 id="features-title" className="text-3xl! font-bold tracking-tight md:text-4xl!">{title}</h2>
            <Tabs active={active} onPick={jump} prefix="pinned" />
            <Panel slug={slug} prefix="pinned" />
            <div className="flex gap-1.5" aria-hidden="true">
              {products.map((product, index) => (
                <span key={product.slug} className={cn('h-1 rounded-full transition-all duration-300', index === active ? 'w-8 bg-foreground' : 'w-3 bg-border')} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Narrow screens, or reduced motion: plain tabs. */}
      <div className={cn(wrap, 'flex flex-col gap-8 py-16', reduce ? 'block' : 'md:hidden')}>
        <h2 className="text-3xl! font-bold tracking-tight md:text-4xl!">{title}</h2>
        <Tabs active={active} onPick={setActive} prefix="plain" />
        <Panel slug={slug} prefix="plain" />
      </div>
    </section>
  )
}
