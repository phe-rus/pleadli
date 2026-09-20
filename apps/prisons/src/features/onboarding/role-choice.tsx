import { ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { m } from '@/paraglide/messages'
import { ArrowRight01Icon, ComputerIcon, NetworkIcon, PrisonIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { motion } from 'framer-motion'

/** The first question of a new installation. Facility comes first because it
 * is nearly always the answer; a workstation of an existing facility is a
 * quieter link, since it would otherwise confuse the main decision. */
export function RoleChoiceScreen({ onChooseFacility, onChooseHeadOffice, onChooseWorkstation }: { onChooseFacility: () => void; onChooseHeadOffice: () => void; onChooseWorkstation: () => void }) {
  return (
    <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-7">
      <ScreenHeader icon={PrisonIcon} title={m.onboarding_role_title()} description={m.onboarding_role_description()} />
      <div className="flex flex-col gap-2.5">
        <RoleOption icon={PrisonIcon} iconTint="text-primary" title={m.onboarding_role_facility_title()} description={m.onboarding_role_facility_description()} onClick={onChooseFacility} delay={0.1} />
        <RoleOption icon={NetworkIcon} iconTint="text-amber-600 dark:text-amber-400" title={m.onboarding_role_hq_title()} description={m.onboarding_role_hq_description()} onClick={onChooseHeadOffice} delay={0.16} />
      </div>
      <button
        type="button"
        onClick={onChooseWorkstation}
        className="flex w-fit cursor-pointer items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ComputerIcon} size={14} />
        {m.onboarding_role_workstation()}
      </button>
    </motion.div>
  )
}

function RoleOption({ icon, iconTint, title, description, onClick, delay }: { icon: typeof PrisonIcon; iconTint: string; title: string; description: string; onClick: () => void; delay: number }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left shadow-xs ring-1 ring-transparent transition-colors hover:border-primary/40 hover:ring-primary/10"
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10 ${iconTint}`}>
        <HugeiconsIcon icon={icon} size={19} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </motion.button>
  )
}
