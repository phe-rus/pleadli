import { ArrowLeft01Icon, ArrowRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { LinkArrow } from '@/components/link-arrow'
import { ProductWindow } from '@/components/replica/product-window'
import { Reveal } from '@/components/reveal'
import { getProducts } from '@/data/products'
import { productPresentation } from '@/data/product-presentation'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'
const ease = [0.22, 1, 0.36, 1] as const
/** Share of the scroll spent moving the title away and the window into place. */
const INTRO = 0.16
const control = cn(
  'grid size-10 place-items-center rounded-full bg-muted text-foreground/80',
  'transition-colors hover:bg-border hover:text-foreground',
)

function Heading() {
  return (
    <>
      <h1 className="text-4xl! font-semibold tracking-tight md:text-5xl!">{m['polish.intro_title']()}</h1>
      <p className="max-w-4xl text-2xl! font-normal leading-snug! tracking-tight md:text-3xl!">
        <span className="font-medium text-primary-ink">{m['polish.slogan']()}</span> {m['polish.intro_lead']()}
      </p>
    </>
  )
}

/** The first window and every window after it are one window. On wide screens it stays
 * pinned while the page scrolls: the title lifts away, the window settles to the right,
 * and it changes app as each section of text passes. Below that width, and for visitors
 * who ask for less motion, the same content is a plain stack (the CSS in site.css). */
export function PinnedStory() {
  const products = getProducts()
  const count = products.length
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress: progress } = useScroll({ target: track, offset: ['start start', 'end end'] })

  useMotionValueEvent(progress, 'change', (value) => {
    const next = Math.min(count - 1, Math.max(0, Math.floor(((value - INTRO) / (1 - INTRO)) * count)))
    setActive((current) => (current === next ? current : next))
  })

  const windowY = useTransform(progress, [0, INTRO], ['44dvh', '0dvh'])
  const windowX = useTransform(progress, [0, INTRO], ['-26%', '0%'])
  const windowScale = useTransform(progress, [0, INTRO], [1.08, 1])
  const heroOpacity = useTransform(progress, [0, INTRO * 0.6], [1, 0])
  const heroY = useTransform(progress, [0, INTRO], [0, -64])
  const heroPointer = useTransform(progress, (value) => (value < INTRO * 0.5 ? 'auto' : 'none'))
  const storyOpacity = useTransform(progress, [INTRO * 0.55, INTRO], [0, 1])
  const storyPointer = useTransform(progress, (value) => (value > INTRO * 0.8 ? 'auto' : 'none'))

  const jump = (index: number) => {
    const el = track.current
    if (!el) return
    const next = (index + count) % count
    const scrollable = el.offsetHeight - window.innerHeight
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + (INTRO + ((next + 0.5) / count) * (1 - INTRO)) * scrollable, behavior: 'smooth' })
  }

  const current = products[active]
  const intro = productPresentation(current.slug)

  return (
    <>
      <div ref={track} className="story-pinned relative hidden md:block" style={{ height: `${(count + 1.3) * 72}dvh` }}>
        <div className="sticky top-14 h-[calc(100dvh-3.5rem)]">
          <div className={cn(wrap, 'relative h-full')}>
            <motion.div style={{ opacity: heroOpacity, y: heroY, pointerEvents: heroPointer }} className="absolute inset-x-0 top-0 flex flex-col items-start gap-5 pt-12">
              <Heading />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {products.map((product, index) => (
                  <button key={product.slug} type="button" onClick={() => jump(index)} className="text-base font-medium text-primary-ink underline-offset-8 hover:underline">
                    {product.name}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div style={{ opacity: storyOpacity, pointerEvents: storyPointer }} className="absolute left-0 top-1/2 w-[31%] -translate-y-1/2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current.slug}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.32, ease }}
                  className="flex flex-col items-start gap-5"
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
                    <HugeiconsIcon icon={current.icon} className="size-5! text-primary-ink" />
                    {current.name}
                  </span>
                  <h2 className="text-4xl! font-bold leading-[1.1]! tracking-tight">{intro.title}</h2>
                  <p className="text-base! leading-relaxed text-muted-foreground">{intro.lead}</p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {current.homePoints.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm">
                        <HugeiconsIcon icon={Tick02Icon} className="mt-0.5 size-4! shrink-0 text-primary-ink" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link to="/products/$slug" params={{ slug: current.slug }} className="text-base font-medium text-primary-ink hover:underline">
                    {m['home.learn_more']()} <LinkArrow />
                  </Link>
                </motion.div>
              </AnimatePresence>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  {products.map((product, index) => (
                    <span key={product.slug} className={cn('h-1 rounded-full transition-all duration-300', index === active ? 'w-6 bg-foreground' : 'w-2 bg-border')} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" className={control} aria-label={m['preview.previous']()} onClick={() => jump(active - 1)}>
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4!" />
                  </button>
                  <button type="button" className={control} aria-label={m['preview.next']()} onClick={() => jump(active + 1)}>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4!" />
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div
              style={{ x: windowX, y: windowY, scale: windowScale }}
              className="absolute right-0 top-1/2 w-[64%] -translate-y-1/2 will-change-transform"
            >
              <ProductWindow key={current.slug} slug={current.slug} name={current.name} priority />
            </motion.div>
          </div>
        </div>
      </div>

      <div className="story-stacked md:hidden">
        <div className={cn(wrap, 'flex flex-col items-start gap-5 pb-10 pt-12')}>
          <Heading />
        </div>
        {products.map((product) => {
          const copy = productPresentation(product.slug)
          return (
            <div key={product.slug} className={cn(wrap, 'flex flex-col gap-6 py-10')}>
              <Reveal className="flex flex-col items-start gap-4">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
                  <HugeiconsIcon icon={product.icon} className="size-5! text-primary-ink" />
                  {product.name}
                </span>
                <h2 className="text-3xl! font-bold leading-[1.1]! tracking-tight">{copy.title}</h2>
                <p className="text-base! leading-relaxed text-muted-foreground">{copy.lead}</p>
                <Link to="/products/$slug" params={{ slug: product.slug }} className="text-base font-medium text-primary-ink hover:underline">
                  {m['home.learn_more']()} <LinkArrow />
                </Link>
              </Reveal>
              <ProductWindow slug={product.slug} name={product.name} />
            </div>
          )
        })}
      </div>
    </>
  )
}
