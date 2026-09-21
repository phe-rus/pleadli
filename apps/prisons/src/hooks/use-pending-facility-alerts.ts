import { useFacilities } from '@/features/facilities'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import { m } from '@/paraglide/messages'

const NOTIFIED_KEY = 'pleadli:prisons-pending-facility-alerts-notified'

function alreadyNotified(facilityId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    return seen.includes(facilityId)
  } catch {
    return false
  }
}

function markNotified(facilityId: string) {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    const seen: string[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, facilityId].slice(-500)))
  } catch {
    // Worst case a facility re-notifies once; not worth failing over.
  }
}

/**
 * Fires one native notification the first time a facility appears as
 * `pending_verification`, so a Head Office officer doesn't have to keep
 * the Facilities page open to notice a new registration (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/0002-peer-registration-and-
 * pairing.md). Head Office only — wired into `EstateHome`, mirroring how
 * the facility side's own mandatory-bail/hospitalised alerts are wired
 * into `FacilityOverview`.
 */
export function usePendingFacilityAlerts() {
  const enabled = isTauri()
  const { data: facilities } = useFacilities(enabled)

  useEffect(() => {
    if (!enabled || !facilities) return

    let cancelled = false
    async function check() {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted || cancelled) return

      for (const facility of facilities ?? []) {
        if (facility.status !== 'pending_verification' || alreadyNotified(facility.id)) continue

        sendNotification({
          title: m.hooks_facility_pending_verification(),
          body: m.hooks_registered_and_is_waiting_for_approval({ name: facility.name, region: facility.region }),
        })
        markNotified(facility.id)
      }
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, facilities])
}
