import { useHospitalised } from '@/features/health-events'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

const STORAGE_KEY = 'pleadli:prisons-hospitalised-alerts-enabled'
const NOTIFIED_KEY = 'pleadli:prisons-hospitalised-alerts-notified'

/** On by default — only an explicit "false" (the user turned it off) opts out. */
export function isHospitalisedAlertsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setHospitalisedAlertsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Best-effort preference only; nothing depends on this persisting.
  }
}

function alreadyNotified(prisonerId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    return seen.includes(prisonerId)
  } catch {
    return false
  }
}

function markNotified(prisonerId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, prisonerId].slice(-500)))
  } catch {
    // Worst case a prisoner re-notifies once; not worth failing over.
  }
}

/**
 * Fires one native notification per prisoner the first time they appear
 * in the "currently hospitalised, awaiting return" queue (docs/prisons/
 * PRODUCT.md §Health & Welfare, ss.75-76) — a "new event appeared" alert,
 * not a deadline alert, since no return-by date exists to count down to.
 */
export function useHospitalisedAlerts() {
  const enabled = isHospitalisedAlertsEnabled() && isTauri()
  const { data: hospitalised } = useHospitalised()

  useEffect(() => {
    if (!enabled || !hospitalised) return

    let cancelled = false
    async function check() {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const entry of hospitalised) {
        if (alreadyNotified(entry.prisonerId)) continue

        sendNotification({
          title: 'Prisoner hospitalised',
          body: `${entry.lastName}, ${entry.firstName}${entry.facilityName ? ` · ${entry.facilityName}` : ''}`,
        })
        markNotified(entry.prisonerId)
      }
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, hospitalised])
}
