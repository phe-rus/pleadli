import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { motion, useReducedMotion } from 'motion/react'

/** What an app says about itself on the panel. Each app writes its own words. */
export type Brand = {
  /** A line after the product name, such as the kind of office ("Station"). */
  label?: string
  headline?: string
  body?: string
  /** The large faint icon in the corner. */
  icon?: IconSvgElement
}

/** The branded panel down the left of every screen before the workspace: setup, sign-in and the
 * loading screen. One shape for all five apps, so the whole way in, until sign-in, reads as one
 * designed flow. It wears the app's crest and the accent colour chosen in setup. */
export function BrandPanel({ productName, logo, brand }: { productName: string; logo: string; brand?: Brand }) {
  const reduceMotion = useReducedMotion()
  return (
    <div data-tauri-drag-region aria-hidden className="not-typeset relative flex h-full w-full flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground">
      {brand?.icon && (
        <HugeiconsIcon icon={brand.icon} size={420} strokeWidth={0.75} className="pointer-events-none absolute -right-24 -bottom-24 text-primary-foreground/10" />
      )}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative flex items-center gap-2.5"
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-white p-1.5">
          <img src={logo} alt="" draggable={false} className="size-full object-contain" />
        </div>
        <span className="text-sm font-semibold tracking-tight">{brand?.label ? `${productName}, ${brand.label}` : productName}</span>
      </motion.div>
      {(brand?.headline || brand?.body) && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="relative flex max-w-sm flex-col gap-3"
        >
          {brand.headline && <h2 className="text-2xl leading-snug font-semibold text-balance">{brand.headline}</h2>}
          {brand.body && <p className="text-sm text-balance text-primary-foreground/70">{brand.body}</p>}
        </motion.div>
      )}
    </div>
  )
}
