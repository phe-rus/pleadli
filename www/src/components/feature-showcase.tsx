import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { getProducts } from '@/data/products'
import { productPresentation } from '@/data/product-presentation'

/** Every feature of every app, one app at a time: pick an app, read what it does. */
export function FeatureShowcase() {
  const products = getProducts()
  const reduce = useReducedMotion()
  const [slug, setSlug] = useState(products[0].slug)
  const product = products.find((entry) => entry.slug === slug) ?? products[0]

  return (
    <div className="flex flex-col gap-8">
      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((entry) => (
          <button
            key={entry.slug}
            type="button"
            role="tab"
            id={`tab-${entry.slug}`}
            aria-selected={slug === entry.slug}
            aria-controls="feature-panel"
            onClick={() => setSlug(entry.slug)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              slug === entry.slug ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <HugeiconsIcon icon={entry.icon} className="size-4!" />
            {entry.name}
          </button>
        ))}
      </div>

      <div id="feature-panel" role="tabpanel" aria-labelledby={`tab-${slug}`} className="min-h-72">
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
    </div>
  )
}
