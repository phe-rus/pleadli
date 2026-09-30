import { Controls } from '@/components/toolbar/controls'
import { DEFAULT_LOGO, defaultLogo, useDocumentBrand } from '@/features/brand'
import { changeLocale, useLocale } from '@/features/i18n'
import {
  brandOptions,
  completeSetup,
  requestSecondFactor,
  sessionStatusOptions,
  setupStatusOptions,
  signIn,
  signInPeopleOptions,
  useBrand,
  useSessionStatus,
} from '@/features/installation'
import { LockGate } from '@/features/lock'
import { JoinOffice, networkOptions, OfficeUnreachable } from '@/features/network'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { initialPractice, practiceOf, practiceSteps, practiceSummary, roles, type PracticeAnswers } from '@/features/practice-setup/steps'
import { ApiError, onLocked } from '@/lib/api'
import { applyAccent, BootScreen, SETUP_MESSAGES, SetupFlow, SignInScreen, type Locale } from '@pleadli/setup'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

const PRODUCT = 'Pleadli Lawyers'
/** Long enough to read the name, short enough never to feel like waiting. */
const MIN_BOOT_MS = 700

const say = (error: unknown) => (error instanceof ApiError ? error.message : null)

/** Drops every cached read that belonged to whoever used the app before. */
function forgetRecords(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'installation' })
}

function Setup({ locale, onFinished, onJoin }: { locale: Locale; onFinished: () => void; onJoin: () => void }) {
  const { data: status } = useQuery(setupStatusOptions())
  if (!status) return <BootScreen logo={DEFAULT_LOGO} productName={PRODUCT} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SetupFlow
      institution="lawyers"
      productName={PRODUCT}
      welcomeAction={
        <div className="flex flex-col items-center gap-1">
          <p className="text-muted-foreground">{m["network.join_welcome"]()}</p>
          <Button variant="outline" onClick={onJoin}>
            {m["network.join_instead"]()}
          </Button>
        </div>
      }
      defaultLogo={DEFAULT_LOGO}
      defaultAccent="navy"
      locale={locale}
      onLocaleChange={changeLocale}
      roles={roles}
      adminRole="advocate"
      existing={status.existing}
      extraSteps={practiceSteps}
      initialExtra={initialPractice(status.hasMatters)}
      allowOthers={(state) => practiceOf(state).setting === 'firm'}
      summary={practiceSummary}
      requestSecondFactor={requestSecondFactor}
      initialOfficeName={status.existingFirm ?? ''}
      onComplete={async (payload) => {
        const { usagesTouched: _, ...practice } = payload.extra as PracticeAnswers
        await completeSetup({ ...payload, extra: practice })
      }}
      onFinished={onFinished}
      windowControls={<Controls />}
      describeError={say}
    />
  )
}

function SignIn({ locale, officeName, logo, retryAfter, onSignedIn }: { locale: Locale; officeName: string | null; logo: string; retryAfter: number; onSignedIn: () => Promise<void> }) {
  const { data: people } = useQuery(signInPeopleOptions())
  if (!people) return <BootScreen logo={logo} productName={PRODUCT} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SignInScreen
      locale={locale}
      productName={PRODUCT}
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
 * (once, at start), first-launch setup (behind the old PIN lock, for a copy
 * that had it on), then sign-in when the protection level asks for it. It
 * sits outside the routes, so nothing behind it loads until it lets the app
 * through, and it re-renders (never remounts) when the language changes, so a
 * half-finished setup keeps what was typed. What it shows is only the screen:
 * the backend refuses every call itself (428 before setup, 423 signed out).
 */
export function AppGate({ children, onUnlocked }: { children: ReactNode; onUnlocked?: () => void }) {
  const locale = useLocale() as Locale
  const queryClient = useQueryClient()
  const { data: status, isError, error, refetch } = useSessionStatus()
  const { data: network, refetch: refetchNetwork } = useQuery(networkOptions())
  const [joining, setJoining] = useState(false)
  const { data: brand } = useBrand()
  const [booted, setBooted] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), MIN_BOOT_MS)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => onLocked(() => void refetch()), [refetch])
  useEffect(() => applyAccent(brand?.accent), [brand?.accent])
  // Once setup has started it stays on screen until the person leaves it, even
  // after the installation exists, so the closing summary is seen.
  useEffect(() => {
    if (status && !status.installed && !status.legacyLocked) setSetupOpen(true)
  }, [status])
  // The practice's language, the first time this computer opens it.
  useEffect(() => {
    if (!brand?.language) return
    let chosen: string | null = null
    try {
      chosen = localStorage.getItem('PARAGLIDE_LOCALE')
    } catch {}
    if (!chosen) changeLocale(brand.language)
  }, [brand?.language])

  const logo = brand?.logo ?? defaultLogo(brand?.jurisdiction)
  useDocumentBrand(logo, brand?.officeName)
  const refreshAll = async () => {
    forgetRecords(queryClient)
    await queryClient.fetchQuery(sessionStatusOptions())
    await queryClient.invalidateQueries({ queryKey: ['installation'] })
    onUnlocked?.()
  }

  if (!booted || (!status && !isError)) return <BootScreen logo={logo} productName={PRODUCT} label={SETUP_MESSAGES[locale].loading} />
  // A computer joined to an office holds nothing itself: when the office does
  // not answer, say so, instead of showing an empty practice.
  if (!status && network?.mode === 'terminal' && error instanceof ApiError && error.code === 'OFFICE_UNREACHABLE') {
    return (
      <OfficeUnreachable
        message={error.message}
        onRetry={() => void refetch()}
        onLeft={() => {
          queryClient.clear()
          window.location.assign('/')
        }}
      />
    )
  }
  // The API cannot be reached at all: the recovery gate outside explains.
  if (!status) return <>{children}</>
  if (joining && !status.installed) {
    return (
      <JoinOffice
        onCancel={() => setJoining(false)}
        onJoined={async () => {
          setJoining(false)
          setSetupOpen(false)
          queryClient.clear()
          await refetchNetwork()
          await refreshAll()
        }}
      />
    )
  }
  if (setupOpen || !status.installed) {
    return (
      <LockGate>
        <Setup
          locale={locale}
          onJoin={() => setJoining(true)}
          onFinished={() => {
            setSetupOpen(false)
            void queryClient.invalidateQueries({ queryKey: brandOptions().queryKey })
            void refreshAll()
          }}
        />
      </LockGate>
    )
  }
  if (status.locked) {
    return <SignIn locale={locale} officeName={brand?.officeName ?? null} logo={logo} retryAfter={status.retryAfterSeconds} onSignedIn={refreshAll} />
  }
  return <>{children}</>
}
