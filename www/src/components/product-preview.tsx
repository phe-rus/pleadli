import { useEffect, useRef, useState } from 'react'
import type { Product } from '@/data/products'
import { ProductMockup } from './product-mockup'
import * as m from '@/paraglide/messages'

/** A browsable tour of real development screens, with an illustration fallback. */
export function ProductPreview({ product }: { product: Product }) {
  const [selected, setSelected] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const figure = useRef<HTMLElement>(null)
  const screens = product.slug === 'courts' ? [
    { src: '/images/products/courts-hearing.png', label: m['preview.hearing']() },
    { src: '/images/products/courts-documents.png', label: m['preview.documents']() },
    { src: '/images/products/courts-case-file.png', label: m['preview.case']() },
  ] : product.slug === 'prisons' ? [
    { src: '/images/products/prisons-overview.png', label: m['preview.custody']() },
    { src: '/images/products/prisons-jurisdiction.png', label: m['preview.law']() },
  ] : []
  const count = screens.length
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(media.matches)
    updateMotion()
    media.addEventListener('change', updateMotion)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 })
    if (figure.current) observer.observe(figure.current)
    return () => { observer.disconnect(); media.removeEventListener('change', updateMotion) }
  }, [])
  useEffect(() => {
    if (count < 2 || paused || !visible || reducedMotion) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setSelected(current => (current + 1) % count)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [count, paused, visible, reducedMotion])
  const nextSource = count > 1 ? screens[(selected + 1) % count]?.src : undefined
  useEffect(() => {
    if (!visible || !nextSource) return
    const nextImage = new Image()
    nextImage.src = nextSource
  }, [visible, nextSource])
  const screen = screens[selected] ?? screens[0]
  return <figure ref={figure} className={`product-preview product-tone-${product.slug}`}>
    <div className="product-computer">
      <div className={screen ? "product-screen product-screen-fixed" : "product-screen"} key={screen?.src ?? product.slug}>
        {screen ? <img src={screen.src} alt={`${product.name}: ${screen.label}`} width={1280} height={720} loading="lazy" className="block h-full w-full object-contain" /> : <ProductMockup product={product} />}
      </div>
    </div>
    {count > 1 && <div className="preview-playback" role="group" aria-label={m['preview.explore']()}>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{screen.label}</span>
      <div className="flex items-center gap-1">
        {screens.map((item, index) => <button key={item.src} type="button" aria-label={item.label} aria-pressed={selected === index} onClick={() => { setSelected(index); setPaused(true) }} className="preview-dot"><span /></button>)}
      </div>
      <button type="button" aria-label={reducedMotion ? m['preview.next']() : paused ? m['preview.play']() : m['preview.pause']()} onClick={() => { if (reducedMotion) setSelected(current => (current + 1) % count); else setPaused(current => !current) }} className="preview-play-button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {reducedMotion ? <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : paused ? <path d="M9 5.8c0-.8.9-1.3 1.6-.9l9 6.2a1.1 1.1 0 0 1 0 1.8l-9 6.2c-.7.4-1.6-.1-1.6-.9Z" fill="currentColor" /> : <><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" /></>}
      </svg></button>
    </div>}
    <figcaption className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">{screen ? m['preview.real_note']() : m['product.mockup_note']()}</figcaption>
  </figure>
}
