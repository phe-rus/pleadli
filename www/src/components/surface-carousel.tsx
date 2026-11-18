import { ArrowLeft01Icon, ArrowRight01Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperSpecimen, type SpecimenKind } from '@/components/paper-specimen'
import { ProductWindow } from '@/components/replica/product-window'
import { Reveal } from '@/components/reveal'
import { getProducts } from '@/data/products'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'
const control = cn('grid size-10 place-items-center rounded-full bg-muted text-foreground/80', 'transition-colors hover:bg-border hover:text-foreground')

type Item = { key: string; width: string } & ({ app: string } | { paper: SpecimenKind })

/** Windows of different sizes, as the app shows them, with a printed paper between. */
const items: Item[] = [
  { key: 'courts', app: 'courts', width: 'min(82vw, 40rem)' },
  { key: 'summons', paper: 'summons', width: 'min(60vw, 16rem)' },
  { key: 'dpp', app: 'dpp', width: 'min(82vw, 32rem)' },
  { key: 'police', app: 'police', width: 'min(82vw, 40rem)' },
  { key: 'charge', paper: 'charge_sheet', width: 'min(60vw, 16rem)' },
  { key: 'lawyers', app: 'lawyers', width: 'min(82vw, 36rem)' },
  { key: 'prisons', app: 'prisons', width: 'min(82vw, 32rem)' },
]

/** One strip across the page: the five apps and their papers, side by side, running off the right edge.
 * It moves by itself until the visitor pauses it, and stays still for anyone who asks for less motion. */
export function SurfaceCarousel() {
  const products = getProducts()
  const reduce = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLUListElement>(null)
  const [near, setNear] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true)
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const move = useCallback((direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const first = el.children[0] as HTMLElement | undefined
    const step = (first?.offsetWidth ?? 400) + 24
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    if (direction === 1 && end) el.scrollTo({ left: 0, behavior: 'smooth' })
    else if (direction === -1 && el.scrollLeft <= 4) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    else el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }, [])

  const running = playing && !reduce && near && !hovered
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => move(1), 4500)
    return () => window.clearInterval(timer)
  }, [running, move])

  return (
    <section ref={root} className="overflow-x-clip border-t border-border/60" aria-labelledby="surface-title">
      <div className={cn(wrap, 'flex flex-col gap-10 py-16 md:gap-14 md:py-28')}>
        <Reveal className="flex max-w-3xl flex-col items-start gap-4">
          <h2 id="surface-title" className="text-3xl! font-bold leading-tight! tracking-tight md:text-5xl!">{m['surface.title']()}</h2>
          <p className="text-lg! leading-relaxed text-muted-foreground">{m['surface.lead']()}</p>
        </Reveal>

        <div className="flex flex-col gap-6" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <ul
            ref={track}
            className="m-0 flex list-none snap-x snap-mandatory items-end gap-6 overflow-x-auto p-0 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ width: 'calc(100% + (100vw - 100%) / 2)' }}
          >
            {items.map((item) => {
              const product = 'app' in item ? products.find((entry) => entry.slug === item.app) : undefined
              return (
                <li key={item.key} className="shrink-0 snap-start" style={{ width: item.width }}>
                  <figure className="m-0 flex flex-col gap-3">
                    {'app' in item ? near ? <ProductWindow slug={item.app} name={product?.name} /> : <div className="aspect-[1280/860] w-full rounded-xl bg-muted" /> : <PaperSpecimen kind={item.paper} specimen="Specimen" />}
                    <figcaption className="text-base font-medium">{product ? product.name : m['surface.c_paper']()}</figcaption>
                  </figure>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-2 self-end">
            <button type="button" className={control} onClick={() => setPlaying((value) => !value)} aria-label={playing && !reduce ? m['surface.pause']() : m['surface.play']()}>
              <HugeiconsIcon icon={playing && !reduce ? PauseIcon : PlayIcon} className="size-4!" />
            </button>
            <button type="button" className={control} onClick={() => move(-1)} aria-label={m['surface.previous']()}>
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4!" />
            </button>
            <button type="button" className={control} onClick={() => move(1)} aria-label={m['surface.next']()}>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4!" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
