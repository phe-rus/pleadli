import { NodeWaiting } from '@/components/node-waiting'
import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { useBootstrapFirstAccount, useSessionToken, useSignIn, useSystemState } from './queries'
import { onSessionChange, ApiError } from '@/lib/api'
import { LockKeyholeIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Button } from '@pleadli/ui/button'
import { useEffect, useState, type ReactNode } from 'react'
import { m } from '@/paraglide/messages'

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

  if (isLoading) return null
  if (!state) return <NodeWaiting />
  if (state.bootstrap) return <BootstrapScreen headOffice={state.isHeadOffice} />
  if (!token) return <SignInScreen headOffice={state.isHeadOffice} authMode={state.authMode} />
  return <>{children}</>
}

const RECENT_BADGES_KEY = 'prisons.recentBadges'
const MAX_RECENT_BADGES = 3

/** The last few badges that signed in on this machine, most recent first.
 * A badge is not a secret; remembering it saves typing on a shared machine,
 * and never a password. */
function recentBadges(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_BADGES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((b): b is string => typeof b === 'string').slice(0, MAX_RECENT_BADGES) : []
  } catch {
    return []
  }
}

function rememberBadge(badgeNumber: string) {
  const badge = badgeNumber.trim()
  if (!badge) return
  try {
    localStorage.setItem(RECENT_BADGES_KEY, JSON.stringify([badge, ...recentBadges().filter((b) => b !== badge)].slice(0, MAX_RECENT_BADGES)))
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
        t.error(m.session_could_not_create_the_account(), { description: error instanceof ApiError ? error.message : m.session_please_try_again() })
      }
    },
  })

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={UserAdd01Icon}
          title={headOffice ? m.session_set_up_head_office() : m.session_set_up_this_facility()}
          description={
            headOffice
              ? m.session_create_the_first_administrator_account_f()
              : m.session_create_the_first_account_it_is()
          }
        />
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="badgeNumber">{(f) => <f.input label={m.session_badge_number()} autoComplete="username" autoFocus />}</form.AppField>
          <form.AppField name="name">{(f) => <f.input label={m.session_full_name()} autoComplete="name" />}</form.AppField>
          <form.AppField name="password">{(f) => <f.input type="password" label={m.session_password()} autoComplete="new-password" />}</form.AppField>
          <form.AppForm>
            <div className="*:w-full">
              <form.submit label={m.session_create_account()} />
            </div>
          </form.AppForm>
        </form>
      </motion.div>
    </PreAuthLayout>
  )
}

function SignInScreen({ headOffice, authMode }: { headOffice: boolean; authMode: 'password' | 'pin' | 'badge_only' }) {
  const signIn = useSignIn()
  const [recent] = useState(recentBadges)
  const form = useAppForm({
    defaultValues: { badgeNumber: recent[0] ?? '', password: '' },
    onSubmit: async ({ value }) => {
      try {
        await signIn.mutateAsync(value)
        rememberBadge(value.badgeNumber)
      } catch (error) {
        t.error(m.session_could_not_sign_in(), {
          description: error instanceof ApiError ? error.message : m.session_check_your_badge_number_and_password(),
        })
      }
    },
  })
  const badgeOnlyAllowed = authMode === 'badge_only' && !headOffice

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={LockKeyholeIcon}
          title={m.session_sign_in()}
          description={headOffice ? m.session_sign_in_to_prisons_head_quarters() : m.session_sign_in_with_your_badge_number()}
        />
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label={m.session_recent_badges()}>
              <span className="text-xs text-muted-foreground">{m.session_recent()}</span>
              {recent.map((badge) => (
                <button
                  key={badge}
                  type="button"
                  onClick={() => {
                    form.setFieldValue('badgeNumber', badge)
                    document.getElementById('password')?.focus()
                  }}
                  className="cursor-pointer rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                >
                  {badge}
                </button>
              ))}
            </div>
          )}
          <form.AppField name="badgeNumber">{(f) => <f.input label={m.session_badge_number()} autoComplete="username" autoFocus={recent.length === 0} />}</form.AppField>
          <form.AppField name="password">
            {(f) => (
              <f.input
                type="password"
                label={authMode === 'pin' ? m.session_password_or_pin() : m.session_password()}
                autoComplete="current-password"
                autoFocus={recent.length > 0}
              />
            )}
          </form.AppField>
          {badgeOnlyAllowed && <p className="-mt-2">{m.session_leave_the_password_blank_if_your()}</p>}
          <form.AppForm>
            <div className="*:w-full">
              {badgeOnlyAllowed ? (
                <form.Subscribe selector={(state) => [state.values.badgeNumber.trim().length > 0, state.isSubmitting] as const}>
                  {([hasBadge, submitting]) => (
                    <Button type="submit" disabled={!hasBadge || submitting}>
                      {m.session_sign_in()}
                    </Button>
                  )}
                </form.Subscribe>
              ) : (
                <form.submit label={m.session_sign_in()} />
              )}
            </div>
          </form.AppForm>
        </form>
      </motion.div>
    </PreAuthLayout>
  )
}
