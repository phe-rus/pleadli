import { api } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  backupAlertSchema,
  createOfficerSchema,
  officerSchema,
  remoteAccessLogEntrySchema,
  remoteAccessSettingsSchema,
  updateOfficerSchema,
  type CreateOfficerInput,
  type UpdateOfficerInput,
} from './schema'

export async function createOfficer(input: CreateOfficerInput) {
  const parsed = createOfficerSchema.parse(input)
  const officer = await api('/officers', { method: 'POST', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function updateOfficer(id: string, input: UpdateOfficerInput) {
  const parsed = updateOfficerSchema.parse(input)
  const officer = await api(`/officers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function listOfficers() {
  const officers = await api('/officers')
  return z.array(officerSchema).parse(officers)
}

export async function listRemoteAccessLog() {
  const entries = await api('/remote-access/log')
  return z.array(remoteAccessLogEntrySchema).parse(entries)
}

export async function getRemoteAccessSettings() {
  const settings = await api('/remote-access/settings')
  return remoteAccessSettingsSchema.parse(settings)
}

export async function listBackupAlerts() {
  const alerts = await api('/backup-alerts')
  return z.array(backupAlertSchema).parse(alerts)
}

export async function acknowledgeBackupAlert(id: string) {
  await api(`/backup-alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' })
}

/** Alerts that are still open (created, not yet ended) — what the
 * app-shell listener fetches once on startup so an already-active
 * dispatch isn't invisible just because it was created before this
 * window opened. Live changes after that come from the
 * `backup-alert:created`/`backup-alert:updated` Tauri events instead. */
export async function listActiveBackupAlerts() {
  const alerts = await api('/backup-alerts/active')
  return z.array(backupAlertSchema).parse(alerts)
}

/** Dispatches a named officer to respond to an active backup call. */
export async function respondToBackupAlert(id: string, officerId: string) {
  const alert = isTauri()
    ? await invoke('respond_to_backup_alert', { id, officerId })
    : await api(`/backup-alerts/${encodeURIComponent(id)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ officerId }),
      })
  return backupAlertSchema.parse(alert)
}

/** Explicitly ends an active dispatch — the one way it stops being
 * "live"; nothing here ever auto-expires it. */
export async function endBackupAlert(id: string) {
  const alert = isTauri()
    ? await invoke('end_backup_alert', { id })
    : await api(`/backup-alerts/${encodeURIComponent(id)}/end`, { method: 'POST' })
  return backupAlertSchema.parse(alert)
}
