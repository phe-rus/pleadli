import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useState, type ReactNode } from 'react'
import { SETUP_MESSAGES } from './messages'
import { TextField } from './parts'
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

  const reset = () => {
    setChosen(null)
    setSecret('')
    setCode('')
    setPhase('secret')
    setEnrolment(null)
    setError(null)
  }

  const submit = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      const result = await onSignIn({
        staffId: chosen.id,
        secret,
        code: phase === 'secret' ? undefined : code,
        enrolSecret: phase === 'enrol' ? enrolment?.secret : undefined,
      })
      if (result.status === 'code') setPhase('code')
      if (result.status === 'enrol') {
        setEnrolment(result.enrolment)
        setPhase('enrol')
      }
    } catch (e) {
      setError(describeError?.(e) ?? t.signin_failed)
      if (phase !== 'secret') setCode('')
      else if (chosen.secretKind === 'pin') setSecret('')
    } finally {
      setBusy(false)
    }
  }

  const pin = chosen?.secretKind === 'pin'
  const ready = phase === 'secret' ? (pin ? /^\d{6}$/.test(secret) : secret.length > 0) : /^\d{6}$/.test(code)

  return (
    <div className="typeset fixed inset-0 z-50 flex flex-col bg-background">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-end px-4">
        {windowControls}
      </header>
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <img src={logo} alt="" className="size-20 object-contain" draggable={false} />
            <div>
              <h1>{productName}</h1>
              {officeName && <p className="text-muted-foreground">{officeName}</p>}
            </div>
          </div>

          {people.length === 0 ? (
            <p className="text-muted-foreground">{t.signin_no_people}</p>
          ) : !chosen ? (
            <section className="flex w-full flex-col gap-3">
              <h2 className="text-muted-foreground">{t.signin_who}</h2>
              <ul className="not-typeset flex list-none flex-col gap-2 p-0">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(p)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{initials(p.name)}</span>
                      <span className="flex min-w-0 flex-col">
                        <strong className="truncate">{p.name}</strong>
                        {p.rank && <span className="truncate text-muted-foreground">{p.rank}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <form
              className="flex w-full flex-col gap-4 text-left"
              onSubmit={(e) => {
                e.preventDefault()
                if (ready && !busy) void submit()
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{initials(chosen.name)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate">{chosen.name}</strong>
                  {chosen.rank && <span className="truncate text-muted-foreground">{chosen.rank}</span>}
                </div>
                {people.length > 1 && (
                  <Button type="button" variant="ghost" size="lg" className="h-9 rounded-lg px-3" onClick={reset}>
                    <HugeiconsIcon icon={ArrowLeft01Icon} />
                    {t.signin_not_you}
                  </Button>
                )}
              </div>

              {phase === 'secret' && (
                <TextField
                  key={chosen.id}
                  label={pin ? t.pin : t.password}
                  type="password"
                  inputMode={pin ? 'numeric' : undefined}
                  maxLength={pin ? 6 : undefined}
                  autoComplete="current-password"
                  autoFocus
                  value={secret}
                  onChange={(e) => setSecret(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
                />
              )}

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
                <TextField
                  label={t.factor_code}
                  hint={phase === 'code' ? t.signin_code_lead : undefined}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              )}

              <p role="alert" className={cn('not-typeset min-h-5 text-destructive', !error && retryAfterSeconds === 0 && 'invisible')}>
                {error ?? (retryAfterSeconds > 0 ? `${t.signin_failed} (${retryAfterSeconds}s)` : '')}
              </p>

              <Button type="submit" size="lg" className="h-10 rounded-lg" disabled={!ready || busy}>
                {busy ? t.signin_busy : t.signin_submit}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
