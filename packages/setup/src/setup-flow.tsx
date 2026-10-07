import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { findAccent } from './accents'
import { COUNTRIES, findCountry, type Country } from './jurisdictions'
import { LICENCE_VERSION } from './licence'
import { SETUP_MESSAGES, type SetupMessages } from './messages'
import { DoneStep, LicenceStep, LookStep, ModelStep, PeopleStep, ProtectionStep, WelcomeStep, WhereStep } from './steps'
import type { ExistingPerson, Institution, Locale, Model, PersonDraft, Protection, SecondFactorEnrolment, SetupPayload } from './types'

export type SetupRole = { id: string; label: () => string }

/** What an app's own step sees and may change. */
export type ExtraStepContext = {
  t: SetupMessages
  locale: Locale
  country: Country
  state: SetupState
  update: (patch: Partial<SetupState>) => void
}

/** A step an app adds to the shared flow (Lawyers: alone or a firm, what kind
 * of practice, what it does). It either takes the place of a built-in step or
 * follows one. Its answers live in `state.extra` and reach the app, untouched,
 * as `payload.extra`; it may also set shared fields such as `officeName`. */
export type ExtraStep = {
  id: string
  replaces?: BuiltInStep
  after?: BuiltInStep
  render: (ctx: ExtraStepContext) => ReactNode
  canContinue: (ctx: ExtraStepContext) => boolean
}

export type SetupFlowProps = {
  institution: Institution
  productName: string
  defaultLogo: string
  defaultAccent: string
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  /** Roles a person can have; `adminRole` is the one the first person gets. */
  roles: readonly SetupRole[]
  adminRole: string
  /** The app's one yes/no about a person, if it has one. */
  /** A mark some people carry (the head of the service). Worded from the country being set up. */
  personFlag?: { label: (country: Country | undefined) => string; hint?: (country: Country | undefined) => string }
  /** Someone the app already knows (an install from before setup existed). */
  existing?: ExistingPerson | null
  requestSecondFactor: (name: string) => Promise<SecondFactorEnrolment>
  onComplete: (payload: SetupPayload) => Promise<void>
  /** Leave setup for the app. */
  onFinished: () => void
  /** The window's own buttons: the app has no system title bar. */
  windowControls?: ReactNode
  /** Turns an error from `onComplete` into words, when the app has some. */
  describeError?: (error: unknown) => string | null
  /** The app's own steps, and where they go. */
  extraSteps?: readonly ExtraStep[]
  /** The office's name to start with (an older install already knows it). */
  initialOfficeName?: string
  /** Where `state.extra` starts (answers the app already knows). */
  initialExtra?: Record<string, unknown>
  /** Whether others can be added at the people step (Lawyers: not when working alone). */
  allowOthers?: (state: SetupState) => boolean
  /** Lines the app adds to the closing summary. */
  summary?: (ctx: ExtraStepContext) => readonly [string, ReactNode][]
  /** Under the welcome: another way in than a new setup (Lawyers: join the firm's office computer). */
  welcomeAction?: ReactNode
}

const BUILT_IN = ['welcome', 'licence', 'where', 'model', 'protection', 'look', 'people', 'done'] as const
export type BuiltInStep = (typeof BUILT_IN)[number]
export type StepId = BuiltInStep | (string & {})

/** The built-in order with the app's steps put in their places. */
function stepOrder(extra: readonly ExtraStep[] = []): StepId[] {
  const order: StepId[] = []
  for (const step of BUILT_IN) {
    const replacing = extra.filter((e) => e.replaces === step)
    if (replacing.length) order.push(...replacing.map((e) => e.id))
    else order.push(step)
    order.push(...extra.filter((e) => e.after === step).map((e) => e.id))
  }
  return order
}

export type SetupState = {
  licenceAccepted: boolean
  jurisdiction: string
  language: Locale
  model: Model
  officeName: string
  region: string
  protection: Protection
  accent: string
  logo: string | null
  admin: PersonDraft & { confirm: string }
  enrolment: SecondFactorEnrolment | null
  factorCode: string
  people: PersonDraft[]
  /** The app's own answers, from its extra steps. */
  extra: Record<string, unknown>
}

export const PIN = /^\d{6}$/
export const MIN_PASSWORD = 12

export function secretProblem(protection: Protection, secret: string | null): 'pin_invalid' | 'password_short' | null {
  if (protection === 'none') return null
  if (protection === 'basic') return PIN.test(secret ?? '') ? null : 'pin_invalid'
  return (secret ?? '').length >= MIN_PASSWORD ? null : 'password_short'
}

export function SetupFlow(props: SetupFlowProps) {
  const t = SETUP_MESSAGES[props.locale]
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<SetupState>(() => ({
    licenceAccepted: false,
    jurisdiction: 'ug',
    language: props.locale,
    model: 'office',
    officeName: props.initialOfficeName ?? '',
    region: '',
    protection: 'basic',
    accent: props.defaultAccent,
    logo: null,
    admin: {
      name: props.existing?.name ?? '',
      rank: props.existing?.rank ?? '',
      role: props.adminRole,
      flag: props.existing?.flag ?? false,
      secret: '',
      confirm: '',
    },
    enrolment: null,
    factorCode: '',
    people: [],
    extra: props.initialExtra ?? {},
  }))
  const update = (patch: Partial<SetupState>) => setState((s) => ({ ...s, ...patch }))

  const steps = useMemo(() => stepOrder(props.extraSteps), [props.extraSteps])
  const step = steps[index]
  const scroller = useRef<HTMLElement>(null)
  // A new step starts at its top, not where a longer one was left scrolled.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [index])
  const extraStep = props.extraSteps?.find((e) => e.id === step)
  const country = findCountry(state.jurisdiction) ?? COUNTRIES[0]
  const pack = country.institutions[props.institution]
  const ctx: ExtraStepContext = { t, locale: props.locale, country, state, update }
  const othersAllowed = props.allowOthers?.(state) ?? true

  const canContinue = useMemo(() => {
    if (extraStep) return extraStep.canContinue(ctx)
    switch (step) {
      case 'licence':
        return state.licenceAccepted
      case 'model':
        return state.officeName.trim().length > 0
      case 'people': {
        const a = state.admin
        if (!a.name.trim()) return false
        if (state.protection !== 'none') {
          if (secretProblem(state.protection, a.secret) || a.secret !== a.confirm) return false
        }
        if (state.protection === 'full' && !(state.enrolment && /^\d{6}$/.test(state.factorCode))) return false
        return state.people.every((p) => p.name.trim() && !secretProblem(state.protection, p.secret))
      }
      default:
        return true
    }
    // `ctx` is rebuilt from `state` every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state, extraStep])

  const go = (delta: number) => {
    setError(null)
    setDirection(delta)
    setIndex((i) => Math.min(Math.max(i + delta, 0), steps.length - 1))
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    const secret = (p: PersonDraft) => (state.protection === 'none' ? null : p.secret)
    const payload: SetupPayload = {
      licenceVersion: LICENCE_VERSION,
      jurisdiction: state.jurisdiction,
      language: state.language,
      model: state.model,
      officeName: state.officeName.trim(),
      region: state.model === 'office' && state.region.trim() ? state.region.trim() : null,
      protection: state.protection,
      accent: findAccent(state.accent)?.id ?? props.defaultAccent,
      logo: state.logo,
      administrator: {
        name: state.admin.name.trim(),
        rank: state.admin.rank.trim(),
        role: state.admin.role,
        flag: state.admin.flag,
        secret: secret(state.admin),
        secondFactor: state.protection === 'full' && state.enrolment ? { secret: state.enrolment.secret, code: state.factorCode } : null,
      },
      people: state.protection === 'none' || !othersAllowed ? [] : state.people.map((p) => ({ ...p, name: p.name.trim(), rank: p.rank.trim(), secret: secret(p) })),
      extra: state.extra,
    }
    try {
      await props.onComplete(payload)
      go(1)
    } catch (e) {
      setError(props.describeError?.(e) ?? t.failed)
    } finally {
      setBusy(false)
    }
  }

  const counted = steps.length - 1
  const isLast = step === 'people'

  const body = (() => {
    if (extraStep) return extraStep.render(ctx)
    switch (step) {
      case 'welcome':
        return <WelcomeStep t={t} institution={props.institution} productName={props.productName} logo={state.logo ?? props.defaultLogo} action={props.welcomeAction} />
      case 'licence':
        return <LicenceStep t={t} locale={props.locale} accepted={state.licenceAccepted} onAccept={(v) => update({ licenceAccepted: v })} />
      case 'where':
        return (
          <WhereStep
            t={t}
            locale={props.locale}
            jurisdiction={state.jurisdiction}
            language={state.language}
            onCountry={(code) => {
              const next = findCountry(code)
              if (!next) return
              const language = next.languages.includes(state.language) ? state.language : next.defaultLanguage
              const hq = next.institutions[props.institution]?.headquarters ?? null
              const model = state.model === 'headquarters' && hq ? 'headquarters' : 'office'
              update({ jurisdiction: code, language, region: '', model, officeName: model === 'headquarters' ? hq ?? '' : state.model === 'office' ? state.officeName : '' })
              if (language !== props.locale) props.onLocaleChange(language)
            }}
            onLanguage={(language) => {
              update({ language })
              props.onLocaleChange(language)
            }}
          />
        )
      case 'model':
        return (
          <ModelStep
            t={t}
            locale={props.locale}
            country={country}
            pack={pack}
            model={state.model}
            officeName={state.officeName}
            region={state.region}
            onModel={(model) => update({ model, officeName: model === 'headquarters' ? pack?.headquarters ?? '' : '', region: '' })}
            onOfficeName={(officeName) => update({ officeName })}
            onRegion={(region) => update({ region })}
          />
        )
      case 'protection':
        return <ProtectionStep t={t} protection={state.protection} onProtection={(protection) => update({ protection, enrolment: null, factorCode: '' })} />
      case 'look':
        return (
          <LookStep
            t={t}
            locale={props.locale}
            productName={props.productName}
            officeName={state.officeName}
            logo={state.logo}
            defaultLogo={props.defaultLogo}
            accent={state.accent}
            onLogo={(logo) => update({ logo })}
            onAccent={(accent) => update({ accent })}
          />
        )
      case 'people':
        return (
          <PeopleStep
            t={t}
            state={state}
            update={update}
            roles={props.roles}
            adminRole={props.adminRole}
            personFlag={props.personFlag}
            ranks={pack?.ranks ?? []}
            requestSecondFactor={props.requestSecondFactor}
            allowOthers={othersAllowed}
          />
        )
      case 'done':
        return (
          <DoneStep
            t={t}
            locale={props.locale}
            state={state}
            country={country}
            productName={props.productName}
            defaultLogo={props.defaultLogo}
            showModel={steps.includes('model')}
            extraRows={props.summary?.(ctx) ?? []}
          />
        )
    }
  })()

  return (
    // Absolute, not fixed: it fills the app's frame and keeps the desktop window's rounded corners.
    <div className="typeset absolute inset-0 z-50 flex flex-col bg-background">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-4 px-4">
        {/* The window's buttons where a Mac has them; the progress in the middle; nothing else. */}
        <div className="flex min-w-14">{props.windowControls}</div>
        <div data-tauri-drag-region className="flex flex-1 justify-center">
          {step !== 'done' && (
            <ol aria-label={t.step(index + 1, counted)} className="not-typeset flex list-none gap-1.5 p-0">
              {steps.slice(0, counted).map((s, i) => (
                <li
                  key={s}
                  className={cn('size-1.5 rounded-full transition-colors duration-300', i <= index ? 'bg-foreground/70' : 'bg-foreground/15')}
                />
              ))}
            </ol>
          )}
        </div>
        <div className="min-w-14" />
      </header>

      <main ref={scroller} className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -28 * direction }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="mx-auto w-full max-w-xl px-6 pt-10 pb-16"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="shrink-0 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-6 py-4">
          {step === 'done' ? (
            <span />
          ) : (
            <Button variant="ghost" size="lg" className="h-10 rounded-lg px-4" disabled={index === 0 || busy} onClick={() => go(-1)}>
              {t.back}
            </Button>
          )}
          <div className="flex flex-1 justify-center">
            {error ? (
              <p role="alert" className="not-typeset text-destructive">
                {error}
              </p>
            ) : (
              step !== 'done' && <span className="sr-only">{t.step(index + 1, counted)}</span>
            )}
          </div>
          {step === 'done' ? (
            <Button size="lg" className="h-10 rounded-lg px-6" onClick={props.onFinished} autoFocus>
              {t.open(props.productName)}
            </Button>
          ) : (
            <Button size="lg" className="h-10 rounded-lg px-6" disabled={!canContinue || busy} onClick={() => (isLast ? void finish() : go(1))}>
              {isLast ? (busy ? t.finishing : t.finish) : t.continue}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
