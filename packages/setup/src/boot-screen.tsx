import { motion, useReducedMotion } from 'motion/react'

/** The first thing anyone sees: the crest, the name, a quiet progress line.
 * Shown once while the app starts, never again on navigation. */
export function BootScreen({ logo, productName, label }: { logo: string; productName: string; label: string }) {
  const reduceMotion = useReducedMotion()
  return (
    // Absolute, not fixed: it fills the app's frame, so on the desktop it keeps the window's rounded corners.
    <div data-tauri-drag-region role="status" aria-label={`${productName}. ${label}`} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-background">
      <motion.img
        src={logo}
        alt=""
        draggable={false}
        className="size-28 object-contain"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      />
      {/* Only the crest and a thin bar, as a Mac starts: nothing to read while waiting. */}
      <div aria-hidden className="relative h-1 w-44 overflow-hidden rounded-full bg-foreground/10">
        <motion.span
          className="absolute inset-y-0 w-2/5 rounded-full bg-foreground/60"
          animate={reduceMotion ? undefined : { left: ['-40%', '100%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}
