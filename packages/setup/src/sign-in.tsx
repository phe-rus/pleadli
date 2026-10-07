import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useState, type ReactNode } from 'react'
import { SETUP_MESSAGES } from './messages'
import { PasswordField, PinField } from '@pleadli/ui/pin-field'
import type { Locale, SecondFactorEnrolment } from './types'

export type SignInPerson = {
  id: string
  name: string
  rank: string | null
  secretKind: 'pin' | 'password'
  /** Full protection and no phone linked yet: linking is part of this sign-in. */
  needsEnrolment: boolean
}

export type SignInAttempt = { staffId: string; secret: string; code?: string; enrolSecret?: string }

/** What the app answers after checking the PIN or password. */
export type SignInResult = { status: 'signed_in' } | { status: 'code' } | { status: 'enrol'; enrolment: SecondFactorEnrolment }

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

/** The one sign-in screen: pick yourself, give your PIN or password, then the
 * phone code when the protection is full. Kept calm on purpose: a list of
 * faces, one field, one button. */
export function SignInScreen({
  locale,
  productName,
  officeName,
  logo,
  people,
  retryAfterSeconds,
  onSignIn,
  describeError,
  windowControls,
}: {
  locale: Locale
  productName: string
  officeName: string | null
  logo: string
  people: readonly SignInPerson[]
  retryAfterSeconds: number
  onSignIn: (attempt: SignInAttempt) => Promise<SignInResult>
  describeError?: (error: unknown) => string | null
  windowControls?: ReactNode
}) {
  const t = SETUP_MESSAGES[locale]
  const [chosen, setChosen] = useState<SignInPerson | null>(people.length === 1 ? people[0] : null)
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'secret' | 'code' | 'enrol'>('secret')
  const [enrolment, setEnrolment] = useState<SecondFactorEnrolment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped on every failed attempt, so the field shakes even on the same error twice.
  const [failures, setFailures] = useState(0)

  const reset = () => {
    setChosen(null)
    setSecret('')
    setCode('')
    setPhase('secret')
    setEnrolment(null)
    setError(null)
  }

  // The digits are passed in when the last one completes the field, before state has caught up.
  const submit = async (given?: { secret?: string; code?: string }) => {
    if (!chosen || busy) return
    const secretNow = given?.secret ?? secret
    const codeNow = given?.code ?? code
    setBusy(true)
    setError(null)
    try {
      const result = await onSignIn({
        staffId: chosen.id,
        secret: secretNow,
        code: phase === 'secret' ? undefined : codeNow,
        enrolSecret: phase === 'enrol' ? enrolment?.secret : undefined,
      })
      if (result.status === 'code') setPhase('code')
      if (result.status === 'enrol') {
        setEnrolment(result.enrolment)
        setPhase('enrol')
      }
    } catch (e) {
      setError(describeError?.(e) ?? t.signin_failed)
      setFailures((n) => n + 1)
      if (phase !== 'secret') setCode('')
      else if (chosen.secretKind === 'pin') setSecret('')
    } finally {
      setBusy(false)
    }
  }

  const pin = chosen?.secretKind === 'pin'
  const ready = phase === 'secret' ? (pin ? /^\d{6}$/.test(secret) : secret.length > 0) : /^\d{6}$/.test(code)

  const avatar = (person: SignInPerson, size: 'lg' | 'xl') => (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary font-medium text-primary-foreground shadow-sm', size === 'xl' ? 'size-24 text-3xl' : 'size-16 text-xl')}>{initials(person.name)}</span>
  )

  return (
    <div className="typeset fixed inset-0 z-50 flex flex-col bg-background">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-end px-4">
        {windowControls}
      </header>
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16">
        <div className="flex w-full max-w-2xl flex-col items-center gap-10 text-center">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="" className="size-14 object-contain" draggable={false} />
            <div>
              <p className="font-semibold text-foreground">{productName}</p>
              {officeName && <p className="text-[0.8125rem] text-muted-foreground">{officeName}</p>}
            </div>
          </div>

          {people.length === 0 ? (
            <p className="text-muted-foreground">{t.signin_no_people}</p>
          ) : !chosen ? (
            // Who is signing in: faces side by side, the name under each, as a Mac's login window.
            <section className="flex w-full flex-col items-center gap-6">
              <h1 className="text-[1.375rem]">{t.signin_who}</h1>
              <ul className="not-typeset flex list-none flex-wrap justify-center gap-x-6 gap-y-5 p-0">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(p)}
                      className="group flex w-28 cursor-pointer flex-col items-center gap-2 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <span className="transition-transform duration-150 group-hover:scale-105 group-active:scale-95">{avatar(p, 'lg')}</span>
                      <span className="flex w-full min-w-0 flex-col">
                        <span className="truncate text-[0.875rem] font-medium text-foreground">{p.name}</span>
                        {p.rank && <span className="truncate text-xs text-muted-foreground">{p.rank}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <form
              className="flex w-full max-w-xs flex-col items-center gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                if (ready) void submit()
              }}
            >
              <div className="flex flex-col items-center gap-3">
                {avatar(chosen, 'xl')}
                <div className="flex flex-col">
                  <strong className="text-[1.0625rem]">{chosen.name}</strong>
                  {chosen.rank && <span className="text-[0.8125rem] text-muted-foreground">{chosen.rank}</span>}
                </div>
              </div>

              {phase === 'secret' &&
                (pin ? (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-[0.8125rem] text-muted-foreground">{t.pin}</p>
                    <PinField
                      key={chosen.id}
                      label={t.pin}
                      value={secret}
                      onChange={(v) => {
                        setSecret(v)
                        setError(null)
                      }}
                      onComplete={(v) => void submit({ secret: v })}
                      autoFocus
                      disabled={busy}
                      error={failures}
                    />
                  </div>
                ) : (
                  <PasswordField
                    key={chosen.id}
                    placeholder={t.password}
                    aria-label={t.password}
                    autoComplete="current-password"
                    autoFocus
                    value={secret}
                    busy={busy}
                    error={failures}
                    onChange={(e) => {
                      setSecret(e.target.value)
                      setError(null)
                    }}
                  />
                ))}

              {phase === 'enrol' && enrolment && (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground">{t.signin_enrol_lead}</p>
                  <p className="text-muted-foreground">{t.factor_lead}</p>
                  <div className="mx-auto size-44 rounded-lg bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: enrolment.svg }} />
                  <div>
                    <span className="text-muted-foreground">{t.factor_manual}</span>
                    <code className="block break-all select-all">{enrolment.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                  </div>
                </div>
              )}

              {phase !== 'secret' && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[0.8125rem] text-muted-foreground">{phase === 'code' ? t.signin_code_lead : t.factor_code}</p>
                  <PinField
                    masked={false}
                    label={t.factor_code}
                    value={code}
                    onChange={(v) => {
                      setCode(v)
                      setError(null)
                    }}
                    onComplete={(v) => void submit({ code: v })}
                    autoFocus
                    disabled={busy}
                    error={failures}
                  />
                </div>
              )}

              <p role="alert" className={cn('not-typeset min-h-5 text-[0.8125rem] text-destructive', !error && !busy && retryAfterSeconds === 0 && 'invisible')}>
                {busy ? t.signin_busy : (error ?? (retryAfterSeconds > 0 ? `${t.signin_failed} (${retryAfterSeconds}s)` : ''))}
              </p>

              {people.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={reset}>
                  <HugeiconsIcon icon={ArrowLeft01Icon} />
                  {t.signin_not_you}
                </Button>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
