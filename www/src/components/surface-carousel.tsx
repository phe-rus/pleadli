import { ArrowLeft01Icon, ArrowRight01Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperSpecimen, type SpecimenKind } from '@/components/paper-specimen'
import { Reveal } from '@/components/reveal'
import { getProducts } from '@/data/products'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'
const control = cn('grid size-10 place-items-center rounded-full bg-muted text-foreground/80', 'transition-colors hover:bg-border hover:text-foreground')

type Item = { key: string; width: string } & ({ app: string; image: string; w: number; h: number } | { paper: SpecimenKind })

/** Each item is cut to its own shape from the app it comes from (scripts/build-window-images.sh): the wide bench,
 * the tall station list, a low strip of the prosecutor's desk. Between them, two papers as they print. */
const items: Item[] = [
  { key: 'courts', app: 'courts', image: 'courts-bench', w: 1344, h: 778, width: 'min(84vw, 42rem)' },
  { key: 'summons', paper: 'summons', width: 'min(58vw, 15rem)' },
  { key: 'dpp', app: 'dpp', image: 'dpp-desk', w: 1100, h: 558, width: 'min(84vw, 34rem)' },
  { key: 'police', app: 'police', image: 'police-cells', w: 800, h: 764, width: 'min(78vw, 25rem)' },
  { key: 'lawyers', app: 'lawyers', image: 'lawyers-register', w: 1216, h: 570, width: 'min(84vw, 38rem)' },
  { key: 'charge', paper: 'charge_sheet', width: 'min(58vw, 15rem)' },
  { key: 'prisons', app: 'prisons', image: 'prisons-held', w: 960, h: 661, width: 'min(84vw, 30rem)' },
]

/** One strip across the page: the five apps and their papers, running off the right edge.
 * It moves by itself until the visitor pauses it, stays still for anyone who asks for less motion, and
 * uses small pictures, so it holds almost nothing in memory. */
export function SurfaceCarousel() {
  const products = getProducts()
  const reduce = useReducedMotion()
  const track = useRef<HTMLUListElement>(null)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(false)
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const move = useCallback((direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const first = el.children[0] as HTMLElement | undefined
    const step = (first?.offsetWidth ?? 400) + 32
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    if (direction === 1 && end) el.scrollTo({ left: 0, behavior: 'smooth' })
    else if (direction === -1 && el.scrollLeft <= 4) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    else el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }, [])

  const running = playing && !reduce && visible && !hovered
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
            className="m-0 flex list-none snap-x snap-mandatory items-end gap-8 overflow-x-auto p-0 pb-6 [scrollbar-width:none] md:gap-10 [&::-webkit-scrollbar]:hidden"
            style={{ width: 'calc(100% + (100vw - 100%) / 2)' }}
          >
            {items.map((item) => {
              const product = 'app' in item ? products.find((entry) => entry.slug === item.app) : undefined
              return (
                <li key={item.key} className="shrink-0 snap-start" style={{ width: item.width }}>
                  <figure className="m-0 flex flex-col gap-3">
                    {'app' in item ? (
                      <div className="[container-type:inline-size]">
                        <img
                          src={`/images/windows/${item.image}.webp`}
                          alt=""
                          width={item.w}
                          height={item.h}
                          loading="lazy"
                          decoding="async"
                          className="block h-auto w-full rounded-[clamp(2px,0.9cqw,8px)] shadow-[0_1px_2px_#0000000d,0_12px_30px_-18px_#00000047] ring-1 ring-black/10"
                        />
                      </div>
                    ) : (
                      <PaperSpecimen kind={item.paper} specimen="Specimen" />
                    )}
                    <figcaption className="flex flex-col items-start gap-0.5 text-left">
                      <span className="flex items-center gap-2 text-base font-medium">
                        {product && <HugeiconsIcon icon={product.icon} className="size-4! text-primary-ink" />}
                        {product ? product.name : m['surface.c_paper']()}
                      </span>
                      {product && <span className="text-sm text-muted-foreground">{product.homePoints[0]}</span>}
                    </figcaption>
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
