import { useCustodyRecords } from '@/features/custody'
import { custodyCompliance, custodyPersonName } from '@/features/custody/schema'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

const STORAGE_KEY = 'pleadli:custody-alerts-enabled'
const NOTIFIED_KEY = 'pleadli:custody-alerts-notified'
const APPROACHING_HOURS = 2

export function isCustodyAlertsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setCustodyAlertsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Best-effort preference only; nothing depends on this persisting.
  }
}

function alreadyNotified(recordId: string, stage: 'approaching' | 'overdue') {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    return seen.includes(`${recordId}:${stage}`)
  } catch {
    return false
  }
}

function markNotified(recordId: string, stage: 'approaching' | 'overdue') {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, `${recordId}:${stage}`].slice(-500)))
  } catch {
    // Worst case a record re-notifies once; not worth failing over.
  }
}

/**
 * Polls in-custody records for the 48h/7d compliance deadline
 * (features/custody/schema.ts) and fires one native notification per
 * record per stage (approaching, then overdue) — not a background
 * service, since the app only has data while it's open anyway.
 */
export function useCustodyDeadlineAlerts() {
  const enabled = isCustodyAlertsEnabled() && isTauri()
  const { data: records } = useCustodyRecords('')

  useEffect(() => {
    if (!enabled || !records) return

    let cancelled = false
    async function check() {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const record of records) {
        if (record.status !== 'in_custody') continue
        const compliance = custodyCompliance(record)
        const stage: 'approaching' | 'overdue' | null = compliance.isOverdue
          ? 'overdue'
          : compliance.hoursRemaining <= APPROACHING_HOURS
            ? 'approaching'
            : null
        if (!stage || alreadyNotified(record.id, stage)) continue

        sendNotification({
          title: stage === 'overdue' ? 'Custody deadline passed' : 'Custody deadline approaching',
          body: `${custodyPersonName(record)}: ${
            stage === 'overdue'
              ? `${Math.abs(compliance.hoursRemaining).toFixed(1)}h overdue`
              : `${compliance.hoursRemaining.toFixed(1)}h remaining`
          }`,
        })
        markNotified(record.id, stage)
      }
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, records])
}
