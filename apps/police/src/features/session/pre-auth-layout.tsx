import * as m from '@/paraglide/messages'
import { Controls } from '@/components/toolbar/controls'
import { NetworkIcon, PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { BrandLogo } from '@/features/brand'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export type Mode = 'station' | 'command'

/** A function, not a table, so the words are read in the current language. */
const brand = () => ({
  station: { icon: PoliceBadgeIcon, label: m["pre_auth.station_label"](), headline: m["pre_auth.station_headline"](), body: m["pre_auth.station_body"]() },
  command: { icon: NetworkIcon, label: m["pre_auth.command_label"](), headline: m["pre_auth.command_headline"](), body: m["pre_auth.command_body"]() },
  neutral: { icon: PoliceBadgeIcon, label: '', headline: m["pre_auth.neutral_headline"](), body: m["pre_auth.neutral_body"]() },
})

/** Shared shell for every screen that comes before the workspace (first-launch
 * setup and sign-in): a branded panel on the left, the screen itself on the
 * right, so the whole sequence reads as one designed flow. The window has no
 * title bar of its own, so the window buttons and drag region live here. */
export function PreAuthLayout({ mode, children }: { mode?: Mode; children: ReactNode }) {
  return (
    <main data-tauri-drag-region className="typeset grid h-svh grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <BrandPanel mode={mode} />
      <div data-tauri-drag-region className="relative flex items-center justify-center overflow-y-auto bg-background p-8">
        <div className="absolute top-3 right-3">
          <Controls />
        </div>
        {children}
      </div>
    </main>
  )
}

function BrandPanel({ mode }: { mode?: Mode }) {
  const content = brand()[mode ?? 'neutral']
  return (
    <div data-tauri-drag-region className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
      <HugeiconsIcon icon={content.icon} size={420} strokeWidth={0.75} className="pointer-events-none absolute -right-24 -bottom-24 text-primary-foreground/10" />
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="not-typeset relative flex items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-md bg-white p-1">
          <BrandLogo className="size-8" />
        </div>
        <span className="text-sm font-semibold tracking-tight">{content.label ? m["pre_auth.product_with"]({ label: content.label }) : m["pre_auth.product"]()}</span>
      </motion.div>
      <motion.div key={mode ?? 'neutral'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }} className="not-typeset relative flex max-w-sm flex-col gap-3">
        <h2 className="text-2xl leading-snug font-semibold text-balance">{content.headline}</h2>
        <p className="text-sm text-balance text-primary-foreground/70">{content.body}</p>
      </motion.div>
    </div>
  )
}

/** The fade and slide every pre-auth screen uses when it swaps for another, so
 * the sequence feels like one flow. */
export const screenTransition = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
}

export function ScreenHeader({ icon, title, description }: { icon: typeof PoliceBadgeIcon; title: string; description: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.25 }} className="flex flex-col gap-3">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
        <HugeiconsIcon icon={icon} size={20} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-balance">{description}</p>
      </div>
    </motion.div>
  )
}

/** A thin line of segments, one per step, so the officer can see how much is
 * left without a wizard's chrome. */
export function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label={m["pre_auth.step_of"]({ index: index + 1, total })} className="flex gap-1.5">
      {Array.from({ length: total }, (_, position) => (
        <span key={position} className={cn('h-0.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none', position <= index ? 'bg-primary' : 'bg-border')} />
      ))}
    </div>
  )
}
