import { motion, useReducedMotion } from 'motion/react'

/** The first thing anyone sees: the crest, the name, a quiet progress line.
 * Shown once while the app starts, never again on navigation. */
export function BootScreen({ logo, productName, label }: { logo: string; productName: string; label: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <div data-tauri-drag-region className="typeset fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
      <motion.img
        src={logo}
        alt=""
        draggable={false}
        className="size-24 object-contain"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      />
      <div className="flex flex-col items-center gap-3">
        <h1>{productName}</h1>
        <div role="progressbar" aria-label={label} className="relative h-0.5 w-32 overflow-hidden rounded-full bg-muted">
          <motion.span
            className="absolute inset-y-0 w-1/3 rounded-full bg-primary"
            animate={reduceMotion ? undefined : { left: ['-33%', '100%'] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  )
}
