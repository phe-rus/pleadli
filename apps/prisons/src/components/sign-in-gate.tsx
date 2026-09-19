import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { useBootstrapFirstAccount, useSessionToken, useSignIn, useSystemState } from '@/features/session'
import { onSessionChange, ApiError } from '@/lib/api'
import { LockKeyholeIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'

/**
 * Every installation, facility or Head Office, needs a signed-in officer
 * before any record is reachable. This is a courtesy screen: the node
 * refuses every call without a valid session whether or not this gate is
 * rendered (docs/prisons/product-map/05 M.4).
 *
 * A brand new installation has zero accounts, so the first thing it shows is
 * the create-first-account form instead of a sign-in screen nobody can pass.
 * When the session changes (sign-in, sign-out, or the node ending it), cached
 * data and route loaders are dropped so nothing from one officer's session
 * is shown to the next.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const { data: state, isLoading } = useSystemState()
  const token = useSessionToken()
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    return onSessionChange(() => {
      queryClient.clear()
      router.invalidate()
    })
  }, [queryClient, router])

  if (isLoading || !state) return null
  if (state.bootstrap) return <BootstrapScreen headOffice={state.isHeadOffice} />
  if (!token) return <SignInScreen headOffice={state.isHeadOffice} />
  return <>{children}</>
}

const LAST_BADGE_KEY = 'prisons.lastBadge'

function rememberedBadge() {
  try {
    return localStorage.getItem(LAST_BADGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberBadge(badgeNumber: string) {
  try {
    localStorage.setItem(LAST_BADGE_KEY, badgeNumber.trim())
  } catch {
    // Remembering the badge is a convenience only.
  }
}

function BootstrapScreen({ headOffice }: { headOffice: boolean }) {
  const bootstrap = useBootstrapFirstAccount()
  const form = useAppForm({
    defaultValues: { badgeNumber: '', name: '', password: '' },
    onSubmit: async ({ value }) => {
      try {
        await bootstrap.mutateAsync(value)
        rememberBadge(value.badgeNumber)
      } catch (error) {
        t.error('Could not create the account', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={UserAdd01Icon}
          title={headOffice ? 'Set up Head Office' : 'Set up this facility'}
          description={
            headOffice
              ? 'Create the first administrator account for this Head Office.'
              : 'Create the first account. It is the Officer in Charge and administrator, and can add every other account afterward.'
          }
        />
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="badgeNumber">{(f) => <f.input label="Badge number" autoComplete="username" autoFocus />}</form.AppField>
          <form.AppField name="name">{(f) => <f.input label="Full name" autoComplete="name" />}</form.AppField>
          <form.AppField name="password">{(f) => <f.input type="password" label="Password" autoComplete="new-password" />}</form.AppField>
          <form.AppForm>
            <div className="*:w-full">
              <form.submit label="Create account" />
            </div>
          </form.AppForm>
        </form>
      </motion.div>
    </PreAuthLayout>
  )
}

function SignInScreen({ headOffice }: { headOffice: boolean }) {
  const signIn = useSignIn()
  const form = useAppForm({
    defaultValues: { badgeNumber: rememberedBadge(), password: '' },
    onSubmit: async ({ value }) => {
      try {
        await signIn.mutateAsync(value)
        rememberBadge(value.badgeNumber)
      } catch (error) {
        t.error('Could not sign in', {
          description: error instanceof ApiError ? error.message : 'Check your badge number and password.',
        })
      }
    },
  })

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={LockKeyholeIcon}
          title="Sign in"
          description={headOffice ? 'Sign in to Prisons Head Quarters.' : 'Sign in with your badge number to continue.'}
        />
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="badgeNumber">{(f) => <f.input label="Badge number" autoComplete="username" autoFocus={!rememberedBadge()} />}</form.AppField>
          <form.AppField name="password">{(f) => <f.input type="password" label="Password" autoComplete="current-password" autoFocus={Boolean(rememberedBadge())} />}</form.AppField>
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
