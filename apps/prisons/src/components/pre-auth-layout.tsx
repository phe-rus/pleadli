import { HugeiconsIcon } from '@hugeicons/react'
import { PrisonIcon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Shared visual shell for every screen that renders before an officer is
 * signed in and working (role choice, activation, HQ bootstrap, HQ sign
 * in): a branded panel on the left, the actual screen content on the
 * right. Used by `HqOnboardingGate` and `HqSignInGate` so the whole pre
 * auth sequence reads as one continuous, designed flow rather than a
 * patchwork of screens each with their own layout. */
export function PreAuthLayout({ children }: { children: ReactNode }) {
  return (
    // `h-full` alone would need an unbroken height chain up to the viewport,
    // which the root layout's wrapping divs don't provide (they size to
    // content, not the window); `h-svh` sidesteps that, matching the root
    // `<main>`'s own `h-svh`.
    <div className="grid h-svh grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <BrandPanel />
      <div className="relative flex items-center justify-center overflow-hidden bg-background p-8">{children}</div>
    </div>
  )
}

function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
      <HugeiconsIcon
        icon={PrisonIcon}
        size={420}
        strokeWidth={0.75}
        className="pointer-events-none absolute -right-24 -bottom-24 text-primary-foreground/10"
      />
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative flex items-center gap-2.5"
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-primary-foreground/15">
          <HugeiconsIcon icon={PrisonIcon} size={17} />
        </div>
        <span className="text-sm font-semibold tracking-tight">Pleadli Prisons</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className="relative flex max-w-sm flex-col gap-3"
      >
        <h2 className="text-2xl leading-snug font-semibold text-balance">
          A custody and operations platform for Uganda's prison service.
        </h2>
        <p className="text-sm text-balance text-primary-foreground/70">
          Every facility keeps working offline first. Head Office sees the national picture the moment a facility
          reaches it.
        </p>
      </motion.div>
    </div>
  )
}

/** The fade/slide transition every pre auth screen uses when it swaps for
 * another one (role choice to activation, sign in to bootstrap, and so
 * on), so the whole sequence feels like one flow. */
export const screenTransition = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
}

export function ScreenHeader({
  icon,
  title,
  description,
}: {
  icon: typeof PrisonIcon
  title: string
  description: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.25 }}
      className="flex flex-col gap-3"
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
        <HugeiconsIcon icon={icon} size={20} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground text-balance">{description}</p>
      </div>
    </motion.div>
  )
}
