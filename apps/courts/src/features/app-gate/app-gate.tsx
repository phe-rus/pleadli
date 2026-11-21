import { Controls } from '@/components/toolbar/controls'
import { LegalHammerIcon } from '@hugeicons/core-free-icons'
import { DEFAULT_LOGO } from '@/features/brand'
import { changeLocale, useLocale } from '@/features/i18n'
import { completeSetup, getSetupStatus, requestSecondFactor, securityStatusOptions, signIn, signInPeopleOptions, useBrand, useSecurityStatus } from '@/features/installation'
import { ApiError, onLocked } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { applyAccent, BootScreen, SETUP_MESSAGES, SetupFlow, SignInScreen, type Locale, type SetupRole, type Brand } from '@pleadli/setup'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

/** What the panel beside setup, sign-in and loading says. This app writes its own words. */
const panelBrand = (): Brand => ({ label: m["pre_auth.label"](), headline: m["pre_auth.headline"](), body: m["pre_auth.body"](), icon: LegalHammerIcon })


const PRODUCT = 'Pleadli Courts'
/** Long enough to read the name, short enough never to feel like waiting. */
const MIN_BOOT_MS = 700

const say = (error: unknown) => (error instanceof ApiError ? error.message : null)

const roles: readonly SetupRole[] = [
  { id: 'administrator', label: () => m['staff.role.administrator']() },
  { id: 'judicial_officer', label: () => m['staff.role.judicial_officer']() },
  { id: 'registrar', label: () => m['staff.role.registrar']() },
]

function Setup({ locale, onFinished }: { locale: Locale; onFinished: () => void }) {
  const { data: status } = useQuery({ queryKey: ['installation', 'setup'], queryFn: getSetupStatus, retry: false })
  if (!status) return <BootScreen logo={DEFAULT_LOGO} productName={PRODUCT} brand={panelBrand()} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SetupFlow
      institution="courts"
      productName={PRODUCT} brand={panelBrand()}
      defaultLogo={DEFAULT_LOGO}
      defaultAccent="gold"
      locale={locale}
      onLocaleChange={changeLocale}
      roles={roles}
      adminRole="administrator"
      personFlag={{ label: () => m['staff.flag.is_head'](), hint: () => m['staff.flag.is_head_hint']() }}
      existing={status.existing}
      requestSecondFactor={requestSecondFactor}
      onComplete={async (payload) => {
        await completeSetup(payload)
      }}
      onFinished={onFinished}
      windowControls={<Controls />}
      describeError={say}
    />
  )
}

function SignIn({ locale, officeName, logo, retryAfter, onSignedIn }: { locale: Locale; officeName: string | null; logo: string; retryAfter: number; onSignedIn: () => Promise<void> }) {
  const { data: people } = useQuery(signInPeopleOptions())
  if (!people) return <BootScreen logo={logo} productName={PRODUCT} brand={panelBrand()} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SignInScreen
      locale={locale}
      productName={PRODUCT} brand={panelBrand()}
      officeName={officeName}
      logo={logo}
      people={people}
      retryAfterSeconds={retryAfter}
      windowControls={<Controls />}
      onSignIn={async (attempt) => {
        const result = await signIn(attempt)
        if (result.status === 'signed_in') await onSignedIn()
        return result
      }}
    />
  )
}

/**
 * Everything that stands before the workspace, in order: the boot screen,
 * first-launch setup, then sign-in when the protection level asks for it. It
 * sits outside the router, so nothing behind it loads until it lets the app
 * through. The same gate as every other Pleadli app; only the words differ.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const locale = useLocale() as Locale
  const queryClient = useQueryClient()
  const { data: status, isError, refetch } = useSecurityStatus()
  const { data: brand } = useBrand()
  const [booted, setBooted] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), MIN_BOOT_MS)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => onLocked(() => void refetch()), [refetch])
  useEffect(() => applyAccent(brand?.accent), [brand?.accent])
  useEffect(() => {
    if (status && status.state === 'ready' && !status.installed) setSetupOpen(true)
  }, [status])

  const logo = brand?.logo ?? DEFAULT_LOGO
  const refreshAll = async () => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'security' && q.queryKey[0] !== 'installation' })
    await queryClient.fetchQuery(securityStatusOptions())
    await queryClient.invalidateQueries({ queryKey: ['installation'] })
  }

  if (!booted || (!status && !isError)) return <BootScreen logo={logo} productName={PRODUCT} brand={panelBrand()} label={SETUP_MESSAGES[locale].loading} />
  if (!status) return <>{children}</>
  if (status.state === 'recovery') return <>{children}</>
  if (setupOpen || !status.installed) {
    return (
      <Setup
        locale={locale}
        onFinished={() => {
          setSetupOpen(false)
          void refreshAll()
        }}
      />
    )
  }
  if (status.locked) return <SignIn locale={locale} officeName={brand?.officeName ?? null} logo={logo} retryAfter={status.retryAfterSeconds} onSignedIn={refreshAll} />
  return <>{children}</>
}
