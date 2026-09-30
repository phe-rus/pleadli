import * as m from '@/paraglide/messages'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import { ApiError } from '@/lib/api'
import { signIn } from './data'
import { ScreenFrame } from './screen-frame'
import type { Installation } from './schema'

const RECENT_KEY = 'pleadli:police:recent-badges'

/** The last few badges that signed in on this machine, most recent first. A
 * badge is not a secret; remembering it saves typing at a shared desk. A
 * password is never remembered. */
function recentBadges(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((b): b is string => typeof b === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

function rememberBadge(badge: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([badge, ...recentBadges().filter((b) => b !== badge)].slice(0, 3)))
  } catch {
    // Remembering is a convenience only.
  }
}

/** A Station signs in with a badge number, and with a password too once an
 * administrator has turned passwords on. A Command always needs both. */
export function SignInScreen({ installation, onSignedIn }: { installation: Installation; onSignedIn: () => void }) {
  const command = installation.mode === 'command'
  const needsPassword = installation.authMode === 'password'
  const [badge, setBadge] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recent = recentBadges()

  return (
    <ScreenFrame
      mode={installation.mode ?? undefined}
      title={command ? m["sign_in.command_title"]() : m["sign_in.title"]()}
      description={
        command
          ? m["sign_in.command_desc"]({ name: installation.name ?? m["sign_in.this_command"]() })
          : needsPassword
            ? m["sign_in.password_desc"]({ name: installation.name ?? m["sign_in.this_station"]() })
            : m["sign_in.badge_desc"]({ name: installation.name ?? m["sign_in.this_station"]() })
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await signIn({ badgeNumber: badge, password })
            rememberBadge(badge.trim())
            setPassword('')
            onSignedIn()
          } catch (e) {
            setError(e instanceof ApiError ? e.message : m["sign_in.failed"]())
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input autoFocus aria-label={m["common.badge_number"]()} placeholder={m["common.badge_number"]()} autoComplete="username" value={badge} disabled={busy} onChange={(e) => setBadge(e.target.value)} />
        {recent.length > 0 && !badge && (
          <div className="flex flex-wrap gap-1.5" aria-label={m["sign_in.recent"]()}>
            {recent.map((recentBadge) => (
              <button
                key={recentBadge}
                type="button"
                onClick={() => setBadge(recentBadge)}
                className="cursor-pointer rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/70"
              >
                {recentBadge}
              </button>
            ))}
          </div>
        )}
        {(command || needsPassword) && (
          <Input type="password" aria-label={m["common.password"]()} placeholder={m["common.password"]()} autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !badge.trim() || ((command || needsPassword) && !password)}>
          {busy && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />}
          {busy ? m["sign_in.signing_in"]() : m["sign_in.title"]()}
        </Button>
      </form>
    </ScreenFrame>
  )
}
