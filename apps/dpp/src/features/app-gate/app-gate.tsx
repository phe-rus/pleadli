import { Controls } from '@/components/toolbar/controls'
import { setCustodyReader } from '@/features/assist/context'
import type { CustodyEvent } from '@/features/custody'
import { DEFAULT_LOGO, defaultLogo } from '@/features/brand'
import { productName, setActiveJurisdiction } from '@/lib/jurisdiction'
import { changeLocale, useLocale } from '@/features/i18n'
import { completeSetup, getSetupStatus, requestSecondFactor, signIn, signInPeopleOptions, useBrand } from '@/features/installation'
import { LockScreen, RecoveryScreen, securityStatusOptions, useSecurityStatus } from '@/features/security'
import { ApiError, onLocked } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { applyAccent, prosecutionNames, BootScreen, SETUP_MESSAGES, SetupFlow, SignInScreen, type Locale, type SetupRole } from '@pleadli/setup'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

const PRODUCT = 'Pleadli DPP'
/** Before setup the app is simply Pleadli DPP; after it, the office's own service name. */
const product = () => (productName() === 'Pleadli' ? PRODUCT : productName())
/** Long enough to read the name, short enough never to feel like waiting. */
const MIN_BOOT_MS = 700

const say = (error: unknown) => (error instanceof ApiError ? error.message : null)

const roles: readonly SetupRole[] = [
  { id: 'administrator', label: () => m["staff.role.administrator"]() },
  { id: 'prosecutor', label: () => m["staff.role.prosecutor"]() },
  { id: 'clerk', label: () => m["staff.role.clerk"]() },
]

/** Keeps every cached read that belonged to whoever used the app before. */
function forgetRecords(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'security' && q.queryKey[0] !== 'installation' })
}

function Setup({ locale, onFinished }: { locale: Locale; onFinished: () => void }) {
  const { data: status } = useQuery({ queryKey: ['installation', 'setup'], queryFn: getSetupStatus, retry: false })
  if (!status) return <BootScreen logo={DEFAULT_LOGO} productName={product()} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SetupFlow
      institution="dpp"
      productName={product()}
      defaultLogo={DEFAULT_LOGO}
      defaultAccent="gold"
      locale={locale}
      onLocaleChange={changeLocale}
      roles={roles}
      adminRole="administrator"
      personFlag={{
        label: (country) => m["staff.flag.is_dpp"]({ head: prosecutionNames(country).head }),
        hint: (country) => m["staff.flag.is_dpp_hint"]({ head: prosecutionNames(country).head }),
      }}
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
  if (!people) return <BootScreen logo={logo} productName={product()} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SignInScreen
      locale={locale}
      productName={product()}
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
 * Everything that stands before the workspace, in order: the boot screen
 * (once, at start), recovery when the data cannot be opened, first-launch
 * setup, then sign-in when the protection level asks for it. It sits outside
 * the router, so nothing behind it loads until it lets the app through, and it
 * re-renders (never remounts) when the language changes, so a half-finished
 * setup keeps what was typed.
 */
export function AppGate({ children, onUnlocked }: { children: ReactNode; onUnlocked?: () => void }) {
  const locale = useLocale() as Locale
  const queryClient = useQueryClient()
  // Assist reads the custody record the screen already holds.
  setCustodyReader((fileId) => queryClient.getQueryData<CustodyEvent[]>(['custody', fileId]) ?? [])
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
  // The window is named after the office's own service ("Pleadli · ODPP", "Pleadli · Parquet").
  useEffect(() => {
    document.title = product()
  }, [brand?.jurisdiction])
  // Once setup has started it stays on screen until the person leaves it, even
  // after the installation exists, so the closing summary is seen.
  useEffect(() => {
    if (status && status.state === 'ready' && !status.installed && !status.locked) setSetupOpen(true)
  }, [status])
  // The office's language, the first time this computer opens it.
  useEffect(() => {
    if (!brand?.language) return
    let chosen: string | null = null
    try {
      chosen = localStorage.getItem('PARAGLIDE_LOCALE')
    } catch {}
    if (!chosen) changeLocale(brand.language)
  }, [brand?.language])

  // Plain functions (decision names, reference labels) read the country from here.
  setActiveJurisdiction(brand?.jurisdiction)
  const logo = brand?.logo ?? defaultLogo(brand?.jurisdiction)
  const refreshAll = async () => {
    forgetRecords(queryClient)
    await queryClient.fetchQuery(securityStatusOptions())
    await queryClient.invalidateQueries({ queryKey: ['installation'] })
    onUnlocked?.()
  }

  if (!booted || (!status && !isError)) return <BootScreen logo={logo} productName={product()} label={SETUP_MESSAGES[locale].loading} />
  // The API cannot be reached at all: the app's own error handling takes over.
  if (!status) return <>{children}</>
  if (status.state === 'recovery') return <RecoveryScreen reason={status.reason} pending={status.restorePending} />
  if (setupOpen || (!status.installed && !status.locked)) {
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
  // An older installation still behind its passphrase: unlock, then set up.
  if (!status.installed) return <LockScreen retryAfter={status.retryAfterSeconds} onUnlocked={() => void refetch()} />
  if (status.locked) {
    return <SignIn locale={locale} officeName={brand?.officeName ?? null} logo={logo} retryAfter={status.retryAfterSeconds} onSignedIn={refreshAll} />
  }
  return <>{children}</>
}
