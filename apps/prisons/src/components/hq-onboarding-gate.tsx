import { useState } from 'react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon, ComputerIcon, NetworkIcon, PrisonIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'framer-motion'
import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { useChooseRole, useVerifyActivationCode } from '@/features/activation'
import { useConnectToNode } from '@/features/node'
import { ApiError } from '@/lib/api'
import { useHqConfig } from '@/features/session'
import type { ReactNode } from 'react'

/** First launch role choice (spec:
 * docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-and-activation-code.md).
 * Sits in front of `HqSignInGate`: while `hq_config.role` is unset, this
 * gate owns the screen entirely. Once a role is chosen (`'facility'`
 * persists immediately; `'head_office'` only once activation succeeds),
 * it renders straight through and `HqSignInGate` takes over as before. */
export function HqOnboardingGate({ children }: { children: ReactNode }) {
  const { data: hqConfig, isLoading } = useHqConfig()
  const [screen, setScreen] = useState<'role' | 'activation' | 'workstation'>('role')

  if (isLoading) return null
  if (hqConfig?.role != null) return <>{children}</>

  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {screen === 'activation' ? (
          <ActivationScreen key="activation" onBack={() => setScreen('role')} />
        ) : screen === 'workstation' ? (
          <WorkstationScreen key="workstation" onBack={() => setScreen('role')} />
        ) : (
          <RoleChoiceScreen
            key="role"
            onChooseHeadOffice={() => setScreen('activation')}
            onChooseWorkstation={() => setScreen('workstation')}
          />
        )}
      </AnimatePresence>
    </PreAuthLayout>
  )
}

function RoleChoiceScreen({ onChooseHeadOffice, onChooseWorkstation }: { onChooseHeadOffice: () => void; onChooseWorkstation: () => void }) {
  const chooseRole = useChooseRole()

  return (
    <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-7">
      <ScreenHeader
        icon={PrisonIcon}
        title="What kind of installation is this?"
        description="This decides whether this machine runs routine custody work, or oversees every paired facility nationwide."
      />
      <div className="flex flex-col gap-2.5">
        <RoleOption
          icon={PrisonIcon}
          iconTint="text-primary"
          title="Prison Facility"
          description="Routine custody work at a single prison."
          disabled={chooseRole.isPending}
          onClick={() => chooseRole.mutate('facility')}
          delay={0.1}
        />
        <RoleOption
          icon={NetworkIcon}
          iconTint="text-amber-600 dark:text-amber-400"
          title="Prisons Head Quarters"
          description="Oversees every paired facility nationwide."
          disabled={chooseRole.isPending}
          onClick={onChooseHeadOffice}
          delay={0.16}
        />
        <RoleOption
          icon={ComputerIcon}
          iconTint="text-sky-600 dark:text-sky-400"
          title="Workstation of a facility node"
          description="Another computer in a facility that already has its node."
          disabled={chooseRole.isPending}
          onClick={onChooseWorkstation}
          delay={0.22}
        />
      </div>
    </motion.div>
  )
}

function RoleOption({
  icon,
  iconTint,
  title,
  description,
  disabled,
  onClick,
  delay,
}: {
  icon: typeof PrisonIcon
  iconTint: string
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
  delay: number
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left shadow-xs ring-1 ring-transparent transition-colors hover:border-primary/40 hover:ring-primary/10 disabled:pointer-events-none disabled:opacity-50"
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10 ${iconTint}`}>
        <HugeiconsIcon icon={icon} size={19} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={16}
        className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </motion.button>
  )
}

function ActivationScreen({ onBack }: { onBack: () => void }) {
  const verifyActivationCode = useVerifyActivationCode()

  const form = useAppForm({
    defaultValues: { token: '' },
    onSubmit: async ({ value }) => {
      try {
        await verifyActivationCode.mutateAsync(value.token.trim())
      } catch {
        t.error('Invalid or expired activation code', { description: 'Check the code and try again.' })
      }
    },
  })

  return (
    <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        Back
      </button>
      <ScreenHeader
        icon={ShieldKeyIcon}
        title="Activate Head Office"
        description="Paste the activation code Pleadli Cloud issued for this installation. Checked entirely on this machine, no internet connection needed."
      />
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="token">
          {(f) => (
            <f.input
              label="Activation code"
              placeholder="Paste the code here"
              icon={<HugeiconsIcon icon={ShieldKeyIcon} size={14} />}
              autoFocus
            />
          )}
        </form.AppField>
        <form.AppForm>
          <div className="*:w-full">
            <form.submit label="Activate" />
          </div>
        </form.AppForm>
      </motion.form>
    </motion.div>
  )
}


function WorkstationScreen({ onBack }: { onBack: () => void }) {
  const connect = useConnectToNode()

  const form = useAppForm({
    defaultValues: { address: '', fingerprint: '', code: '' },
    onSubmit: async ({ value }) => {
      try {
        await connect.mutateAsync(value)
      } catch (error) {
        t.error('Could not connect to the node', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        Back
      </button>
      <ScreenHeader
        icon={ComputerIcon}
        title="Connect to the facility node"
        description="On the node computer, open Settings, Node and backups, and make an enrolment code. Enter the node's address, its fingerprint and the code here."
      />
      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="address">{(f) => <f.input label="Node address" placeholder="192.168.1.10:47921" autoFocus />}</form.AppField>
        <form.AppField name="fingerprint">{(f) => <f.input label="Fingerprint" placeholder="AB:CD:…" />}</form.AppField>
        <form.AppField name="code">{(f) => <f.input label="Enrolment code" placeholder="1234-5678" />}</form.AppField>
        <form.AppForm>
          <div className="*:w-full">
            <form.submit label={connect.isPending ? 'Connecting…' : 'Connect'} />
          </div>
        </form.AppForm>
      </form>
    </motion.div>
  )
}
