import { useIsBootstrap, OfficerForm } from '@/features/officers'
import { useCurrentHqSession, useHqConfig, useHqLogin } from '@/features/session'
import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { t } from '@pleadli/ui/goey-toaster'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { LockKeyholeIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Gates the whole app on a signed in officer, but only when this
 * installation is configured as Head Office (feature 22, Head Office and
 * peer prison sync network, sets `hq_config.is_head_office`; this spec
 * only defines and reads it). Every other, ordinary peer installation
 * renders straight through, unaffected. A brand new Head Office install
 * with zero officers gets the create-first-admin form here instead of an
 * unreachable sign in screen. Shares its visual shell (`PreAuthLayout`)
 * with `HqOnboardingGate`, the screen right before this one, so the whole
 * pre auth sequence reads as one continuous flow. */
export function HqSignInGate({ children }: { children: ReactNode }) {
  const { data: hqConfig, isLoading: configLoading } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false

  const { data: session, isLoading: sessionLoading } = useCurrentHqSession(isHeadOffice)
  const { data: isBootstrap, isLoading: bootstrapLoading } = useIsBootstrap()

  if (!isHeadOffice) return <>{children}</>
  if (configLoading || sessionLoading || bootstrapLoading) return null
  if (session) return <>{children}</>
  if (isBootstrap) return <BootstrapScreen />
  return <SignInScreen />
}

function BootstrapScreen() {
  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={UserAdd01Icon}
          title="Set up Head Office"
          description="Create the first admin account for this installation."
        />
        <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <OfficerForm isBootstrap />
        </div>
      </motion.div>
    </PreAuthLayout>
  )
}

function SignInScreen() {
  const hqLogin = useHqLogin()

  const form = useAppForm({
    defaultValues: { badgeNumber: '', password: '' },
    onSubmit: async ({ value }) => {
      try {
        await hqLogin.mutateAsync(value)
      } catch {
        t.error('Could not sign in', { description: 'Check your badge number and password.' })
      }
    },
  })

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader icon={LockKeyholeIcon} title="Sign in" description="This is a Head Office installation. Sign in to continue." />
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="badgeNumber">{(f) => <f.input label="Badge number" autoFocus />}</form.AppField>
          <form.AppField name="password">{(f) => <f.input type="password" label="Password" />}</form.AppField>
          <form.AppForm>
            <div className="*:w-full">
              <form.submit label="Sign in" />
            </div>
          </form.AppForm>
        </form>
      </motion.div>
    </PreAuthLayout>
  )
}
