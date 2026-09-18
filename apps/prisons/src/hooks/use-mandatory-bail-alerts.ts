import { daysInCustody, mandatoryBailThresholdDays } from '@/features/prisoners'
import { useRemandList } from '@/features/court-productions'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

const STORAGE_KEY = 'pleadli:prisons-mandatory-bail-alerts-enabled'
const NOTIFIED_KEY = 'pleadli:prisons-mandatory-bail-alerts-notified'

/** On by default — only an explicit "false" (the user turned it off) opts out. */
export function isMandatoryBailAlertsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setMandatoryBailAlertsEnabled(enabled: boolean) {
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
 * Fires one native notification per prisoner the moment they cross the
 * real, constitutional 60/180-day mandatory-bail threshold (docs/prisons/
 * PRODUCT.md §Custody & Remand tracking) — single-stage, since "past
 * threshold" is the one legally-grounded fact here; no "approaching"
 * pre-warning margin is invented.
 */
export function useMandatoryBailAlerts() {
  const enabled = isMandatoryBailAlertsEnabled() && isTauri()
  const { data: remand } = useRemandList()

  useEffect(() => {
    if (!enabled || !remand) return

    let cancelled = false
    async function check() {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const entry of remand) {
        const threshold = mandatoryBailThresholdDays(entry.highCourtOnlyOffence)
        const held = daysInCustody(entry.admittedAt)
        if (held < threshold || alreadyNotified(entry.prisonerId)) continue

        sendNotification({
          title: 'Past mandatory-bail threshold',
          body: `${entry.lastName}, ${entry.firstName}: ${held} days in custody (threshold ${threshold} days)`,
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
  }, [enabled, remand])
}
