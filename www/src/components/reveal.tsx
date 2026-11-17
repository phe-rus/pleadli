import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  /** Play on load instead of on scroll: for the first thing on a page. */
  immediate?: boolean
}

const ease = [0.22, 1, 0.36, 1] as const

/** Fades and lifts its children into place once. Short and small, so a section
 * is never left blank for long. Does nothing for visitors who ask their system
 * for reduced motion. */
export function Reveal({ children, delay = 0, className, immediate = false }: RevealProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  const shown = { opacity: 1, y: 0 }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      {...(immediate ? { animate: shown } : { whileInView: shown, viewport: { once: true, amount: 0.12 } })}
      transition={{ duration: 0.45, delay, ease }}
    >
      {children}
    </motion.div>
  )
}
