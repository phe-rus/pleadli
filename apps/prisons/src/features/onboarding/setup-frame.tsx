import { screenTransition } from '@/components/pre-auth-layout'
import { m } from '@/paraglide/messages'
import { ScreenHeader } from '@/components/pre-auth-layout'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import type { ComponentProps, ReactNode } from 'react'

/** A thin line of segments, one per step, so the officer can see how much is
 * left without a wizard's chrome. */
export function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label={m.onboarding_step_of({ step: index + 1, total })} className="flex gap-1.5">
      {Array.from({ length: total }, (_, position) => (
        <span key={position} className={cn('h-0.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none', position <= index ? 'bg-primary' : 'bg-border')} />
      ))}
    </div>
  )
}

/** One screen of a setup wizard: back link, header, the step's body and its
 * button. Both first-run flows (facility, Head Office) are made of these, so
 * they move and read the same. A screen with no `action` has no button and no
 * back link, for a last screen that is already done. */
export function SetupScreen({
  stepId,
  icon,
  title,
  description,
  onBack,
  action,
  children,
}: {
  stepId: string
  icon: ComponentProps<typeof ScreenHeader>['icon']
  title: string
  description: string
  onBack?: () => void
  action?: { label: string; busy: boolean; onSubmit: () => void }
  children: ReactNode
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.form
        key={stepId}
        {...screenTransition}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          action?.onSubmit()
        }}
      >
        {onBack && (
          <button type="button" onClick={onBack} className="-ml-1 flex w-fit cursor-pointer items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            {m.onboarding_back()}
          </button>
        )}
        <ScreenHeader icon={icon} title={title} description={description} />
        {children}
        {action && (
          <Button type="submit" className="w-full" disabled={action.busy}>
            {action.label}
          </Button>
        )}
      </motion.form>
    </AnimatePresence>
  )
}
