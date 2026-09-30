import { filesOptions } from '@/features/prosecution-files'
import { useQuery } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import * as m from '@/paraglide/messages'

const STORAGE_KEY = 'pleadli:dpp-intake-alerts-enabled'
const NOTIFIED_KEY = 'pleadli:dpp-intake-alerts-notified'

/** On by default — only an explicit "false" (the user turned it off) opts out. */
export function isIntakeAlertsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setIntakeAlertsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Best-effort preference only; nothing depends on this persisting.
  }
}

function alreadyNotified(fileId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    return seen.includes(fileId)
  } catch {
    return false
  }
}

function markNotified(fileId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, fileId].slice(-500)))
  } catch {
    // Worst case a file re-notifies once; not worth failing over.
  }
}

/**
 * Fires one native notification per prosecution file the first time it
 * appears in the intake queue (docs/dpp/PRODUCT.md §Work Queues) — a
 * "new work appeared" alert, not a deadline alert: there is no confirmed
 * time-based SLA for how long a file may sit awaiting a charging
 * decision, so no "approaching" pre-warning stage is invented.
 */
export function useIntakeAlerts() {
  const enabled = isIntakeAlertsEnabled() && isTauri()
  // Not a suspense read: the alerts live in the shell and must never hold it up.
  const { data: files } = useQuery(filesOptions('awaiting'))

  useEffect(() => {
    if (!enabled || !files) return
    const queue = files

    let cancelled = false
    async function check() {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const file of queue) {
        if (alreadyNotified(file.id)) continue

        sendNotification({
          title: m["intake_alerts.title"](),
          body: `${file.title}${file.odppRegistrationNumber ? ` (${file.odppRegistrationNumber})` : ''}`,
        })
        markNotified(file.id)
      }
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, files])
}
