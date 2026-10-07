import * as m from '@/paraglide/messages'
import { ArrowLeft01Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PasswordField } from '@pleadli/ui/pin-field'
import { cn } from '@pleadli/ui/lib/utils'
import { useState, type FormEvent } from 'react'
import { ApiError } from '@/lib/api'
import { chooseFirstPassword, getMe, signIn } from './data'
import { ScreenFrame } from './screen-frame'
import type { Installation } from './schema'

const RECENT_KEY = 'pleadli:police:recent-officers'

/** `password` remembers that this officer is asked for one (an administrator,
 * or every officer where the station requires it), so the face opens the field. */
type Recent = { badge: string; name: string | null; rank: string | null; password?: boolean }

/** The last few officers who signed in at this desk, most recent first. A
 * badge and a name are not secrets; a password is never remembered. */
function recentOfficers(where: string): Recent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${RECENT_KEY}:${where}`) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((r): r is Recent => typeof r?.badge === 'string').slice(0, 4) : []
  } catch {
    return []
  }
}

function remember(where: string, officer: Recent) {
  try {
    localStorage.setItem(`${RECENT_KEY}:${where}`, JSON.stringify([officer, ...recentOfficers(where).filter((r) => r.badge !== officer.badge)].slice(0, 4)))
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

/**
 * Signing in, the way a Mac's login window does it: the officers who use this
 * desk as faces, one click to choose; then, where the station asks for one,
 * a single rounded password field with the arrow inside. A Station on badges
 * alone signs a known officer in with that one click. A Command always asks
 * for the password, and so does an administrator's face everywhere: the
 * badge is not a secret and an administrator can change everything. An
 * administrator with no password yet chooses one here, once.
 */
export function SignInScreen({ installation, onSignedIn }: { installation: Installation; onSignedIn: () => void }) {
  const command = installation.mode === 'command'
  const needsPassword = command || installation.authMode === 'password'
  // Faces are remembered per installation: a desk belongs to one station.
  const desk = `${installation.mode ?? ''}:${installation.name ?? ''}`
  const recent = recentOfficers(desk)
  const [chosen, setChosen] = useState<Recent | null>(null)
  const [typing, setTyping] = useState(recent.length === 0)
  const [badge, setBadge] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  /** What the chosen officer must give: nothing, their password, or a first
   * password to choose (the server says which). */
  const [ask, setAsk] = useState<'none' | 'password' | 'choose'>(needsPassword ? 'password' : 'none')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const signedIn = async (badgeNumber: string, withPassword: boolean) => {
    const me = await getMe().catch(() => null)
    remember(desk, { badge: badgeNumber.trim(), name: me?.name ?? null, rank: me?.rank ?? null, password: withPassword || undefined })
    setPassword('')
    setAgain('')
    onSignedIn()
  }

  const go = async (badgeNumber: string, pass: string) => {
    setBusy(true)
    setError(null)
    try {
      await signIn({ badgeNumber, password: pass })
      await signedIn(badgeNumber, needsPassword || pass !== '')
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) {
        // The badge alone is not enough for this officer.
        setChosen((current) => current ?? { badge: badgeNumber.trim(), name: null, rank: null })
        setAsk(e.message === 'choose_password' ? 'choose' : 'password')
        return
      }
      setError(e instanceof ApiError ? e : new Error(m["sign_in.failed"]()))
    } finally {
      setBusy(false)
    }
  }

  const choose = (r: Recent) => {
    setChosen(r)
    setError(null)
    const asked = needsPassword || r.password ? 'password' : 'none'
    setAsk(asked)
    if (asked === 'none') void go(r.badge, '')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const b = chosen?.badge ?? badge
    if (!b.trim()) return
    if (ask !== 'choose') return void go(b, password)
    if (password.length < 8) return setError(new Error(m["sign_in.choose_short"]()))
    if (password !== again) return setError(new Error(m["sign_in.choose_mismatch"]()))
    setBusy(true)
    setError(null)
    chooseFirstPassword({ badgeNumber: b, password })
      .then(() => signedIn(b, true))
      .catch((e) => setError(e instanceof ApiError ? e : new Error(m["sign_in.failed"]())))
      .finally(() => setBusy(false))
  }

  const back = () => {
    setChosen(null)
    setPassword('')
    setAgain('')
    setError(null)
    setAsk(needsPassword ? 'password' : 'none')
  }

  const where = installation.name ?? (command ? m["sign_in.this_command"]() : m["sign_in.this_station"]())
  const message = error instanceof Error ? error.message : null

  return (
    <ScreenFrame mode={installation.mode ?? undefined} title={command ? m["sign_in.command_title"]() : m["sign_in.title"]()} description={where}>
      {chosen ? (
        <form onSubmit={submit} className="flex flex-col items-center gap-4">
          <span className="flex size-20 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-2xl font-semibold text-primary-foreground">{initials(chosen)}</span>
          <div className="flex flex-col items-center">
            <strong>{[chosen.rank, chosen.name].filter(Boolean).join(' ') || chosen.badge}</strong>
            <span className="text-[0.8125rem] text-muted-foreground">{m["sign_in.badge"]({ badge: chosen.badge })}</span>
          </div>
          {ask === 'choose' ? (
            <>
              <p className="max-w-72 text-center text-[0.8125rem] text-muted-foreground">{m["sign_in.choose_lead"]()}</p>
              <input
                autoFocus
                type="password"
                autoComplete="new-password"
                aria-label={m["sign_in.choose_new"]()}
                placeholder={m["sign_in.choose_new"]()}
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full max-w-64 rounded-full bg-card px-4 ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/60"
              />
              <PasswordField placeholder={m["sign_in.choose_again"]()} aria-label={m["sign_in.choose_again"]()} autoComplete="new-password" value={again} busy={busy || password.length === 0} error={error} onChange={(e) => setAgain(e.target.value)} className="max-w-64" />
            </>
          ) : ask === 'password' ? (
            <PasswordField autoFocus placeholder={m["common.password"]()} aria-label={m["common.password"]()} autoComplete="current-password" value={password} busy={busy} error={error} onChange={(e) => setPassword(e.target.value)} className="max-w-64" />
          ) : (
            busy && <p className="text-muted-foreground">{m["sign_in.signing_in"]()}</p>
          )}
          {message && (
            <p role="alert" className="text-center text-destructive">
              {message}
            </p>
          )}
          <button type="button" onClick={back} className="flex cursor-pointer items-center gap-1 text-[0.8125rem] text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            {m["sign_in.someone_else"]()}
          </button>
        </form>
      ) : typing ? (
        <form onSubmit={submit} className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-full max-w-64 items-center gap-1 rounded-full bg-card ps-4 pe-1 ring-1 ring-border focus-within:ring-2 focus-within:ring-primary/60">
            <input
              autoFocus
              inputMode="text"
              aria-label={m["common.badge_number"]()}
              placeholder={m["common.badge_number"]()}
              autoComplete="username"
              value={badge}
              disabled={busy}
              onChange={(e) => setBadge(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
            />
            {!needsPassword && (
              <button type="submit" aria-label={m["sign_in.title"]()} disabled={!badge.trim() || busy} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-default disabled:opacity-30">
                <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
              </button>
            )}
          </div>
          {needsPassword && (
            <PasswordField placeholder={m["common.password"]()} aria-label={m["common.password"]()} autoComplete="current-password" value={password} busy={busy || !badge.trim()} error={error} onChange={(e) => setPassword(e.target.value)} className="max-w-64" />
          )}
          {message && (
            <p role="alert" className="text-center text-destructive">
              {message}
            </p>
          )}
          {recent.length > 0 && (
            <button type="button" onClick={() => setTyping(false)} className="cursor-pointer text-[0.8125rem] text-muted-foreground hover:text-foreground">
              {m["sign_in.back_to_faces"]()}
            </button>
          )}
        </form>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-wrap justify-center gap-5">
            {recent.map((r) => (
              <button key={r.badge} type="button" onClick={() => choose(r)} className={cn('group flex w-20 cursor-pointer flex-col items-center gap-2 outline-none')}>
                <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary/70 to-primary text-lg font-semibold text-primary-foreground ring-offset-2 ring-offset-background transition group-hover:ring-2 group-hover:ring-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  {initials(r)}
                </span>
                <span className="line-clamp-2 text-center text-[0.8125rem] leading-tight">{r.name ?? r.badge}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setTyping(true)} className="cursor-pointer text-[0.8125rem] text-muted-foreground hover:text-foreground">
            {m["sign_in.other_officer"]()}
          </button>
        </div>
      )}
    </ScreenFrame>
  )
}
