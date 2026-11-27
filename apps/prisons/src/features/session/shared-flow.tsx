import { DEFAULT_LOGO, setBrandLogo } from '@/features/brand'
import { PrisonGuardIcon } from '@hugeicons/core-free-icons'
import { changeLocale, useLocale } from '@/features/i18n'
import { conventionsSchema, identitySchema, initialDraft, type Draft } from '@/features/onboarding/schema'
import { ConventionsStep } from '@/features/onboarding/setup-steps'
import { setupFacility, setupHeadOffice } from '@/features/onboarding/data'
import { TextField } from '@/components/form-fields'
import { api, ApiError } from '@/lib/api'
import { m } from '@/paraglide/messages'
import { DesktopControls } from '@pleadli/shell'
import { applyAccent, BootScreen, SETUP_MESSAGES, SetupFlow, SignInScreen, type ExtraStep, type Locale, type SetupRole, type Brand } from '@pleadli/setup'
import { useQuery } from '@tanstack/react-query'
import { useRef, type ReactNode } from 'react'
import { listSignInPeople, requestSecondFactor, sharedSignIn } from './data'

/** What the panel beside setup, sign-in and loading says. This app writes its own words. */
const panelBrand = (): Brand => ({ label: m.brand_label(), headline: m.brand_headline(), body: m.brand_body(), icon: PrisonGuardIcon })


const PRODUCT = 'Pleadli Prisons'
const ACCENT_KEY = 'pleadli:prisons:accent'

/** The accent chosen at setup, kept on this computer like the logo. */
export function loadAccent() {
  try {
    applyAccent(localStorage.getItem(ACCENT_KEY))
  } catch {
    /* the default accent stays */
  }
}

const say = (error: unknown) => (error instanceof ApiError ? error.message : null)

const roles: readonly SetupRole[] = [
  { id: 'oic', label: () => m.officers_officer_in_charge() },
  { id: 'officer', label: () => m.officers_officer_general_duty() },
  { id: 'records', label: () => m.officers_records_and_reception() },
]

const controls = () => <DesktopControls labels={{ group: 'Window controls', close: m.ui_close(), minimize: m.ui_minimize(), maximize: m.ui_maximize() }} />

/** What the facility step keeps in the flow's own answers. */
type FacilityAnswers = Pick<Draft, 'facilityCode' | 'location' | 'badgePrefix' | 'numberingPattern' | 'numberingReset' | 'documentPrefix'>
const initialFacility: FacilityAnswers = {
  facilityCode: '',
  location: '',
  badgePrefix: '',
  numberingPattern: initialDraft.numberingPattern,
  numberingReset: initialDraft.numberingReset,
  documentPrefix: '',
}

const draftOf = (name: string, region: string, extra: Record<string, unknown> | undefined): Draft => ({ ...initialDraft, name, region, ...initialFacility, ...(extra?.facility as Partial<FacilityAnswers> | undefined) })

/** The facility's own questions, after where it is: its code, badge and
 * prisoner-number conventions. Head Office holds no prisoners, so it is asked
 * for its code and place only. */
const facilityStep: ExtraStep = {
  id: 'facility',
  after: 'model',
  canContinue: ({ state }) => {
    const draft = draftOf(state.officeName, state.region, state.extra)
    return identitySchema.safeParse(draft).success && (state.model === 'headquarters' || conventionsSchema.safeParse(draft).success)
  },
  render: ({ state, update }) => {
    const draft = draftOf(state.officeName, state.region, state.extra)
    const set = (patch: Partial<FacilityAnswers>) => update({ extra: { ...state.extra, facility: { ...(state.extra?.facility as object), ...patch } } })
    const body: ReactNode =
      state.model === 'headquarters' ? (
        <TextField label={m.setup_document_prefix()} value={draft.documentPrefix} onChange={(documentPrefix) => set({ documentPrefix })} autoComplete="off" description={m.setup_document_prefix_description()} />
      ) : (
        <ConventionsStep draft={draft} errors={{}} update={set} />
      )
    return (
      <div className="flex flex-col gap-4">
        <TextField label={m.setup_facility_code()} value={draft.facilityCode} onChange={(facilityCode) => set({ facilityCode })} autoComplete="off" description={m.setup_facility_code_description()} autoFocus />
        <TextField label={m.setup_location()} value={draft.location} onChange={(location) => set({ location })} autoComplete="off" placeholder={m.setup_location_placeholder()} />
        {body}
      </div>
    )
  },
}

/** First launch of a facility or Head Office: the same screens as every other
 * Pleadli app, with the facility's own step added. */
export function SharedSetup({ welcomeAction, onDone, onStarted }: { welcomeAction?: ReactNode; onDone: (headOffice: boolean) => void; onStarted: () => void }) {
  const locale = useLocale() as Locale
  const headOffice = useRef(false)
  // A facility already in this computer's records folder is offered before a new setup.
  const found = useQuery({ queryKey: ['records-found'], queryFn: async () => (await api('GET', '/api/records/found')) as { institution: string; records: number; lastSaved: number } | null })
  if (found.isPending) return null
  const restore = found.data
    ? {
        ...found.data,
        onRestore: async (phrase?: string) => {
          await api('POST', '/api/records/restore', { body: { phrase } })
          window.location.reload()
        },
      }
    : null
  return (
    <SetupFlow
      institution="prisons"
      productName={PRODUCT} brand={panelBrand()}
      defaultLogo={DEFAULT_LOGO}
      defaultAccent="green"
      locale={locale}
      onLocaleChange={changeLocale}
      roles={roles}
      adminRole="oic"
      protections={['basic', 'full']}
      identifierLabel={m.officers_badge_number()}
      extraSteps={[facilityStep]}
      welcomeAction={welcomeAction}
      restore={restore}
      requestSecondFactor={requestSecondFactor}
      onComplete={async (payload) => {
        onStarted()
        headOffice.current = payload.model === 'headquarters'
        const draft = draftOf(payload.officeName, payload.region ?? '', payload.extra)
        const jurisdiction = { id: 'ug', country: 'Uganda' }
        const admin = payload.administrator
        const adminDraft: Draft = { ...draft, adminBadge: admin.identifier ?? '', adminName: admin.name, adminPassword: admin.secret ?? '' }
        if (payload.model === 'headquarters') {
          await setupHeadOffice(adminDraft, jurisdiction)
        } else {
          await setupFacility(adminDraft, jurisdiction, {
            authMode: payload.protection === 'full' ? 'full' : 'pin',
            adminRank: admin.rank,
            secondFactor: admin.secondFactor,
            people: payload.people.map((p) => ({ badgeNumber: p.identifier ?? '', name: p.name, password: p.secret ?? '', role: p.role, rank: p.rank })),
          })
        }
        try {
          localStorage.setItem(ACCENT_KEY, payload.accent)
        } catch {
          /* kept for this run only */
        }
        applyAccent(payload.accent)
        if (payload.logo) setBrandLogo(payload.logo)
      }}
      onFinished={() => onDone(headOffice.current)}
      windowControls={controls()}
      describeError={say}
    />
  )
}

export function SharedSignIn({ officeName, logo, onSignedIn }: { officeName: string | null; logo: string; onSignedIn: () => void }) {
  const locale = useLocale() as Locale
  const { data: people } = useQuery({ queryKey: ['session', 'people'], queryFn: listSignInPeople, retry: false })
  if (!people) return <BootScreen logo={logo} productName={PRODUCT} brand={panelBrand()} label={SETUP_MESSAGES[locale].loading} />
  return (
    <SignInScreen
      locale={locale}
      productName={PRODUCT} brand={panelBrand()}
      officeName={officeName}
      logo={logo}
      people={people}
      retryAfterSeconds={0}
      windowControls={controls()}
      describeError={say}
      onSignIn={async (attempt) => {
        const result = await sharedSignIn(attempt)
        if (result.status === 'signed_in') onSignedIn()
        return result
      }}
    />
  )
}
