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

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createOfficer(input: CreateOfficerInput) {
  const parsed = createOfficerSchema.parse(input)
  const officer = isTauri()
    ? await invoke('create_officer', { input: parsed })
    : await devFetch('/officers', { method: 'POST', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function updateOfficer(id: string, input: UpdateOfficerInput) {
  const parsed = updateOfficerSchema.parse(input)
  const officer = isTauri()
    ? await invoke('update_officer', { id, input: parsed })
    : await devFetch(`/officers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function listOfficers() {
  const officers = isTauri() ? await invoke('list_officers') : await devFetch('/officers')
  return z.array(officerSchema).parse(officers)
}

export async function listRemoteAccessLog() {
  const entries = isTauri() ? await invoke('list_remote_access_log') : await devFetch('/remote-access/log')
  return z.array(remoteAccessLogEntrySchema).parse(entries)
}

export async function getRemoteAccessSettings() {
  const settings = isTauri()
    ? await invoke('get_remote_access_settings')
    : await devFetch('/remote-access/settings')
  return remoteAccessSettingsSchema.parse(settings)
}

export async function listBackupAlerts() {
  const alerts = isTauri() ? await invoke('list_backup_alerts') : await devFetch('/backup-alerts')
  return z.array(backupAlertSchema).parse(alerts)
}

export async function acknowledgeBackupAlert(id: string) {
  if (isTauri()) {
    await invoke('acknowledge_backup_alert', { id })
    return
  }
  await devFetch(`/backup-alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' })
}

/** Alerts that are still open (created, not yet ended) — what the
 * app-shell listener fetches once on startup so an already-active
 * dispatch isn't invisible just because it was created before this
 * window opened. Live changes after that come from the
 * `backup-alert:created`/`backup-alert:updated` Tauri events instead. */
export async function listActiveBackupAlerts() {
  const alerts = isTauri() ? await invoke('list_active_backup_alerts') : await devFetch('/backup-alerts/active')
  return z.array(backupAlertSchema).parse(alerts)
}

/** Dispatches a named officer to respond to an active backup call. */
export async function respondToBackupAlert(id: string, officerId: string) {
  const alert = isTauri()
    ? await invoke('respond_to_backup_alert', { id, officerId })
    : await devFetch(`/backup-alerts/${encodeURIComponent(id)}/respond`, {
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
    : await devFetch(`/backup-alerts/${encodeURIComponent(id)}/end`, { method: 'POST' })
  return backupAlertSchema.parse(alert)
}
