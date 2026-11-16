import { NodeWaiting } from '@/components/node-waiting'
import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { useBootstrapFirstAccount, useSessionToken, useSystemState } from './queries'
import { getDeskOfficers, signIn } from './data'
import { useQuery } from '@tanstack/react-query'
import { officerRoleLabel } from '@/features/officers/schema'
import { onSessionChange, ApiError } from '@/lib/api'
import { ArrowLeft01Icon, LockKeyholeIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PasswordField, PinField, SignInArrow, signInFieldClass, signInInputClass } from '@pleadli/ui/pin-field'
import { cn } from '@pleadli/ui/lib/utils'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
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

const RECENT_KEY = 'pleadli:prisons:recent-officers'

/** The last few officers who signed in at this desk, most recent first. A
 * badge and a name are not secrets; a password is never remembered. */
type Recent = { badge: string; name: string | null; role: string | null; passwordless?: boolean }

function recentOfficers(): Recent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((r): r is Recent => typeof r?.badge === 'string').slice(0, 4) : []
  } catch {
    return []
  }
}

function rememberOfficer(officer: Recent) {
  if (!officer.badge.trim()) return
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([officer, ...recentOfficers().filter((r) => r.badge !== officer.badge)].slice(0, 4)))
  } catch {
    // Remembering is a convenience only.
  }
}

const initials = (r: Recent) =>
  (r.name ?? r.badge)
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

function BootstrapScreen({ headOffice }: { headOffice: boolean }) {
  const bootstrap = useBootstrapFirstAccount()
  const form = useAppForm({
    defaultValues: { badgeNumber: '', name: '', password: '' },
    onSubmit: async ({ value }) => {
      try {
        await bootstrap.mutateAsync(value)
        rememberOfficer({ badge: value.badgeNumber.trim(), name: value.name.trim() || null, role: null })
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
          <form.AppField name="password">{(f) => <f.input type="password" label={m.setup_admin_password()} autoComplete="new-password" />}</form.AppField>
          <p className="-mt-2 text-[0.8125rem] text-muted-foreground">{m.session_bootstrap_password_hint()}</p>
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

/**
 * Signing in, the way a Mac's login window does it, and the way Pleadli
 * Police does: the officers who use this desk as faces, one click to choose;
 * then a single rounded password field with the arrow inside. Where the
 * facility signs in on badges alone, a face signs in with that one click.
 * Head Office asks for its six-digit passcode.
 */
function SignInScreen({ headOffice, authMode }: { headOffice: boolean; authMode: 'password' | 'pin' | 'badge_only' }) {
  const needsPassword = headOffice || authMode !== 'badge_only'
  const [remembered] = useState(recentOfficers)
  // On a facility that signs in on badges, every officer is a face, as every
  // account is on a Mac's login window: the ones who used this desk lately
  // first. Anywhere else, only the faces remembered at this desk.
  const { data: desk = [], isFetched } = useQuery({ queryKey: ['auth', 'desk'], queryFn: getDeskOfficers, staleTime: 0, retry: false })
  const recent: Recent[] = desk.length
    ? [...desk]
        .map((o) => ({ badge: o.badgeNumber, name: o.name, role: officerRoleLabel(o.role), passwordless: o.passwordless }))
        .sort((a, b) => rank(a.badge) - rank(b.badge))
    : remembered
  function rank(badge: string) {
    const i = remembered.findIndex((r) => r.badge === badge)
    return i === -1 ? remembered.length : i
  }
  const [chosen, setChosen] = useState<Recent | null>(null)
  const [badge, setBadge] = useState('')
  // Typing a name or a badge narrows the facility's officers as it goes.
  const query = badge.trim().toLowerCase()
  const matches = desk.length && query
    ? recent.filter((r) => r.badge.toLowerCase().includes(query) || (r.name ?? '').toLowerCase().includes(query)).slice(0, 5)
    : []
  const [typingChoice, setTyping] = useState<boolean | null>(null)
  const typing = typingChoice ?? (isFetched && recent.length === 0)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  // On badges alone, an officer who has been given a password is asked for it.
  const [askPassword, setAskPassword] = useState(needsPassword)
  const secretLabel = authMode === 'pin' && !headOffice ? m.session_password_or_pin() : m.session_password()
  // Head Office signs in with a six-digit passcode, shown as six places that
  // fill as it is typed, the way an iPhone asks; an account that has chosen
  // a longer password switches to the password field.
  const [passcode, setPasscode] = useState(headOffice)

  const go = async (badgeNumber: string, pass: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await signIn(badgeNumber.trim(), pass)
      rememberOfficer({ badge: badgeNumber.trim(), name: result.officer.name, role: officerRoleLabel(result.officer.role) })
      setPassword('')
    } catch (e) {
      if (!askPassword && pass === '') {
        setAskPassword(true)
        return
      }
      setPassword('')
      setError(e instanceof ApiError ? e : new Error(m.sign_in_failed()))
    } finally {
      setBusy(false)
    }
  }

  const choose = (r: Recent) => {
    setChosen(r)
    setError(null)
    if (r.passwordless || !askPassword) void go(r.badge, '')
    else setAskPassword(true)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const b = chosen?.badge ?? badge
    if (!b.trim()) return
    if (!chosen) {
      // The badge first, then whatever this officer signs in with. A name
      // typed that matches one officer is that officer.
      const exact = recent.find((r) => r.badge.toLowerCase() === b.trim().toLowerCase()) ?? (matches.length === 1 ? matches[0] : undefined)
      choose(exact ?? { badge: b.trim(), name: null, role: null })
      return
    }
    void go(b, password)
  }

  const back = () => {
    setChosen(null)
    setPassword('')
    setError(null)
    setAskPassword(needsPassword)
  }

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          centered
          icon={LockKeyholeIcon}
          title={m.session_sign_in()}
          description={headOffice ? m.session_sign_in_to_prisons_head_quarters() : !chosen && !typing && recent.length > 0 ? m.sign_in_choose_yourself() : m.session_sign_in_with_your_badge_number()}
        />
        {chosen ? (
          <form onSubmit={submit} className="flex w-full flex-col items-center gap-4">
            <span className="flex size-20 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-2xl font-semibold text-primary-foreground">{initials(chosen)}</span>
            <div className="flex flex-col items-center">
              <strong>{chosen.name ?? chosen.badge}</strong>
              <span className="text-[0.8125rem] text-muted-foreground">{[m.sign_in_badge({ badge: chosen.badge }), chosen.role].filter(Boolean).join(' · ')}</span>
            </div>
            {askPassword && passcode ? (
              <PinField label={m.sign_in_passcode()} value={password} onChange={setPassword} onComplete={(code) => void go(chosen.badge, code)} autoFocus disabled={busy} error={error} autoComplete="current-password" />
            ) : askPassword ? (
              <PasswordField autoFocus placeholder={secretLabel} aria-label={secretLabel} autoComplete="current-password" value={password} busy={busy} error={error} onChange={(e) => setPassword(e.target.value)} className="max-w-72" />
            ) : (
              busy && <p className="text-muted-foreground">{m.sign_in_signing_in()}</p>
            )}
            {error && (
              <p role="alert" className="text-center text-destructive">
                {error.message}
              </p>
            )}
            {askPassword && headOffice && (
              <button
                type="button"
                onClick={() => {
                  setPasscode((p) => !p)
                  setPassword('')
                  setError(null)
                }}
                className="cursor-pointer text-[0.8125rem] text-primary hover:underline"
              >
                {passcode ? m.sign_in_use_password() : m.sign_in_use_passcode()}
              </button>
            )}
            <button type="button" onClick={back} className="flex cursor-pointer items-center gap-1 text-[0.8125rem] text-muted-foreground hover:text-foreground">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
              {m.sign_in_someone_else()}
            </button>
          </form>
        ) : typing ? (
          <form onSubmit={submit} className="flex w-full flex-col items-center gap-2.5">
            <div className={cn(signInFieldClass, 'max-w-72')}>
              <input
                autoFocus
                aria-label={desk.length ? m.sign_in_name_or_badge() : m.session_badge_number()}
                placeholder={desk.length ? m.sign_in_name_or_badge() : m.session_badge_number()}
                autoComplete="username"
                spellCheck={false}
                value={badge}
                disabled={busy}
                onChange={(e) => setBadge(e.target.value)}
                className={signInInputClass}
              />
              <SignInArrow hidden={!badge.trim()} disabled={!badge.trim() || busy} label={m.sign_in_continue()} />
            </div>
            {matches.length > 0 && (
              <div role="listbox" aria-label={m.sign_in_other_officer()} className="flex w-full max-w-72 flex-col overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border/70">
                {matches.map((r) => (
                  <button key={r.badge} type="button" role="option" aria-selected={false} onClick={() => choose(r)} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-left outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/70 to-primary text-[0.6875rem] font-semibold text-primary-foreground">{initials(r)}</span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[0.8125rem]">{r.name ?? r.badge}</span>
                      <span className="truncate text-[0.6875rem] text-muted-foreground">{[r.badge, r.role].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-center text-destructive">
                {error.message}
              </p>
            )}
            {recent.length > 0 && (
              <button type="button" onClick={() => setTyping(false)} className="cursor-pointer text-[0.8125rem] text-muted-foreground hover:text-foreground">
                {m.sign_in_back_to_faces()}
              </button>
            )}
          </form>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className="flex flex-wrap justify-center gap-5">
              {recent.slice(0, 8).map((r) => (
                <button key={r.badge} type="button" onClick={() => choose(r)} className="group flex w-24 cursor-pointer flex-col items-center gap-2 outline-none">
                  <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary/70 to-primary text-lg font-semibold text-primary-foreground ring-offset-2 ring-offset-background transition group-hover:ring-2 group-hover:ring-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    {initials(r)}
                  </span>
                  <span className="line-clamp-2 text-center text-[0.8125rem] leading-tight [overflow-wrap:normal] [word-break:normal]">{r.name ?? r.badge}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setTyping(true)} className="cursor-pointer text-[0.8125rem] text-muted-foreground hover:text-foreground">
              {m.sign_in_other_officer()}
            </button>
          </div>
        )}
        {chosen && askPassword && <p className="text-center text-[0.8125rem] text-muted-foreground">{m.sign_in_forgot()}</p>}
      </motion.div>
    </PreAuthLayout>
  )
}
