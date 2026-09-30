import { useEffect, useRef } from 'react'
import { useLockNow } from './queries'

const IDLE_MS = 5 * 60 * 1000
const FOCUS_GRACE_MS = 10 * 1000
const CHECK_INTERVAL_MS = 5 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

/** Relocks after five real minutes of inactivity, or after the window has
 * lost operating system focus for ten seconds, whichever comes first.
 *
 * The last activity moment is a wall clock timestamp (`Date.now()`), not a
 * plain `setTimeout`: a `setTimeout` pauses while the operating system
 * sleeps, so a laptop that sleeps and resumes could otherwise sit unlocked
 * for far longer than five real minutes. It is re-checked on an interval and
 * again the moment focus or visibility returns, so a resume from sleep locks
 * immediately if five real minutes already passed rather than starting a
 * fresh five minutes on wake. */
export function useIdleLock(active: boolean) {
  const { mutate: relock } = useLockNow()
  const lastActivity = useRef(Date.now())
  const blurredAt = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    lastActivity.current = Date.now()
    blurredAt.current = null

    const touch = () => {
      lastActivity.current = Date.now()
    }
    const checkIdle = () => {
      if (Date.now() - lastActivity.current >= IDLE_MS) relock()
    }
    const checkFocusLoss = () => {
      if (blurredAt.current != null && Date.now() - blurredAt.current >= FOCUS_GRACE_MS) relock()
    }
    const onBlur = () => {
      blurredAt.current = Date.now()
    }
    const onFocus = () => {
      blurredAt.current = null
      checkIdle()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkIdle()
    }

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touch, { passive: true })
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const interval = window.setInterval(() => {
      checkIdle()
      checkFocusLoss()
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [active, relock])
}
