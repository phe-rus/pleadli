import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api, devBackupCreateUrl } from '@/lib/api'
import { auditEntrySchema, securityStatusSchema, stagedSchema, verificationSchema, type Staged } from './schema'

export async function getSecurityStatus() {
  return securityStatusSchema.parse(await api('GET', '/api/security/status'))
}

export const unlock = (passphrase: string) => api('POST', '/api/security/unlock', { body: { passphrase } })
export const lockNow = () => api('POST', '/api/security/lock')
export const setPassphrase = (current: string | null, next: string) => api('PUT', '/api/security/passphrase', { body: { current, new: next } })
export const removePassphrase = (passphrase: string) => api('POST', '/api/security/passphrase/remove', { body: { passphrase } })
export const setIdleMinutes = (minutes: number) => api('PUT', '/api/security/idle', { body: { minutes } })

export async function listAudit(limit = 25) {
  return z.array(auditEntrySchema).parse(await api('GET', '/api/audit', { query: { limit } }))
}

export async function verifyAudit() {
  return verificationSchema.parse(await api('GET', '/api/audit/verify'))
}

/** Makes an encrypted backup. On the desktop the file goes where the
 * prosecutor chooses and the bytes never pass through the webview; in a browser
 * during development it downloads. Returns false if the prosecutor cancelled. */
export async function createBackup(passphrase: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const stamp = new Date().toISOString().slice(0, 10)
    const path = await save({ defaultPath: `pleadli-dpp-${stamp}.dppbk`, filters: [{ name: 'Pleadli DPP backup', extensions: ['dppbk'] }] })
    if (!path) return false
    await invoke('create_backup', { path, passphrase })
    return true
  }
  const response = await fetch(devBackupCreateUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase }) })
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? 'The backup failed.')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'pleadli-dpp.dppbk'
  link.click()
  URL.revokeObjectURL(url)
  return true
}

/** Opens a backup and stages it. Nothing live changes until the app restarts.
 * In a browser a file is passed in; on the desktop the operating system's
 * dialog picks it. Returns null if the prosecutor cancelled. */
export async function stageRestore(passphrase: string, file?: File): Promise<Staged | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const path = await open({ multiple: false, filters: [{ name: 'Pleadli DPP backup', extensions: ['dppbk'] }] })
    if (typeof path !== 'string') return null
    return stagedSchema.parse(await invoke('stage_restore', { path, passphrase }))
  }
  if (!file) return null
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return stagedSchema.parse(await api('POST', '/api/backups/restore', { body: { passphrase, dataBase64: btoa(binary) } }))
}

export async function restartApp() {
  if (isTauri()) await invoke('restart_app')
}
