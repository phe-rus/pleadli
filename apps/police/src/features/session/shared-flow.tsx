import { DEFAULT_LOGO, setBrandLogo } from '@/features/brand'
import { changeLocale, useLocale } from '@/features/i18n'
import { ApiError } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { DesktopControls } from '@pleadli/shell'
import { applyAccent, BootScreen, SETUP_MESSAGES, SetupFlow, SignInScreen, type Brand, type Locale, type SetupRole } from '@pleadli/setup'
import { useQuery } from '@tanstack/react-query'
import { completeSharedSetup, listSignInPeople, requestSecondFactor, sharedSignIn } from './data'

const PRODUCT = 'Pleadli Police'
const ACCENT_KEY = 'pleadli:police:accent'

/** The accent chosen at setup, kept on this computer like the logo. */
export function loadAccent() {
  try {
    applyAccent(localStorage.getItem(ACCENT_KEY))
  } catch {
    /* no storage: the default accent stays */
  }
}

const say = (error: unknown) => (error instanceof ApiError ? error.message : null)

const roles: readonly SetupRole[] = [
  { id: 'officer', label: () => m['officers.role.officer']() },
  { id: 'admin', label: () => m['officers.role.admin']() },
]

/** Police's own words and icon for the panel beside setup, loading and sign-in. */
const brand = (): Brand => ({
  label: m["pre_auth.station_label"](),
  headline: m["pre_auth.neutral_headline"](),
  body: m["pre_auth.neutral_body"](),
  icon: PoliceBadgeIcon,
})

const controls = () => <DesktopControls labels={{ group: m['window.controls'](), close: m['window.close'](), minimize: m['window.minimize'](), maximize: m['window.maximize']() }} />

/** First launch for a station or a headquarters: the same screens as every
 * other Pleadli app. Anyone who signs in with a PIN or a password and a phone
 * code; badge numbers identify officers. */
export function SharedSetup({ onDone }: { onDone: () => void }) {
  const locale = useLocale() as Locale
  return (
    <SetupFlow
      institution="police"
      productName={PRODUCT}
      defaultLogo={DEFAULT_LOGO}
      defaultAccent="blue"
      locale={locale}
      onLocaleChange={changeLocale}
      roles={roles}
      adminRole="admin"
      protections={['basic', 'full']}
      identifierLabel={m['common.badge_number']()}
      requestSecondFactor={requestSecondFactor}
      onComplete={async (payload) => {
        await completeSharedSetup(payload)
        try {
          localStorage.setItem(ACCENT_KEY, payload.accent)
        } catch {
          /* kept for this run only */
        }
        applyAccent(payload.accent)
        if (payload.logo) setBrandLogo(payload.logo)
      }}
      onFinished={onDone}
      windowControls={controls()}
      describeError={say}
      skipWelcome
      brand={brand()}
    />
  )
}

export function SharedSignIn({ officeName, logo, onSignedIn }: { officeName: string | null; logo: string; onSignedIn: () => void }) {
  const locale = useLocale() as Locale
  const { data: people } = useQuery({ queryKey: ['session', 'people'], queryFn: listSignInPeople, retry: false })
  if (!people) return <BootScreen logo={logo} productName={PRODUCT} label={SETUP_MESSAGES[locale].loading} brand={brand()} />
  return (
    <SignInScreen
      locale={locale}
      productName={PRODUCT}
      officeName={officeName}
      logo={logo}
      people={people}
      retryAfterSeconds={0}
      windowControls={controls()}
      describeError={say}
      brand={brand()}
      onSignIn={async (attempt) => {
        const result = await sharedSignIn(attempt)
        if (result.status === 'signed_in') onSignedIn()
        return result
      }}
    />
  )
}
