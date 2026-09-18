import { getToday } from '@/features/obligations/data'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

const ENABLED_KEY = 'pleadli:prisons-obligation-alerts-enabled'
const NOTIFIED_KEY = 'pleadli:prisons-obligation-alerts-notified'

/** On by default: only an explicit "false" (the officer turned it off) opts out. */
export function isObligationAlertsEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setObligationAlertsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch {
    // A preference only; nothing depends on it persisting.
  }
}

function readNotified(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeNotified(keys: string[]) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-500)))
  } catch {
    // Worst case an obligation notifies once more.
  }
}

/**
 * One mechanism for every native alert: an obligation that has come due
 * raises a single OS notification (docs/prisons/product-map/09, hooks
 * merged into the obligation engine). It replaces the separate
 * mandatory-bail and hospitalised hooks, whose triggers are now obligations.
 */
export function useObligationAlerts() {
  const enabled = isObligationAlertsEnabled() && isTauri()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function check() {
      let today
      try {
        today = await getToday()
      } catch {
        return
      }
      const due = today.obligations.filter((o) => o.dueAt != null && o.dueAt <= today.now && o.group === 'due')
      const notified = new Set(readNotified())
      const fresh = due.filter((o) => !notified.has(o.key))
      if (fresh.length === 0 || cancelled) return

      const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const o of fresh.slice(0, 5)) {
        sendNotification({ title: o.title, body: [o.prisonerName, o.detail].filter(Boolean).join(': ') })
      }
      writeNotified([...notified, ...fresh.map((o) => o.key)])
    }

    void check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])
}
