import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api } from '@/lib/api'
import {
  backupConfigSchema,
  connectToNodeSchema,
  deviceSchema,
  enrolmentCodeSchema,
  environmentSchema,
  localConnectionSchema,
  type ConnectToNodeInput,
  backupInfoSchema,
  backupsOverviewSchema,
  backupSummarySchema,
  recoveryStatusSchema,
  saveBackupConfigSchema,
  type SaveBackupConfigInput,
} from './schema'

export async function getRecoveryStatus() {
  return recoveryStatusSchema.parse(await api('GET', '/api/system/recovery'))
}

export async function listRecoveryBackups(dir: string | null) {
  return z.array(backupInfoSchema).parse(await api('POST', '/api/system/recovery/backups', { body: { dir } }))
}

export async function restoreInRecovery(path: string, passphrase: string) {
  return backupSummarySchema.parse(await api('POST', '/api/system/recovery/restore', { body: { path, passphrase } }))
}

export async function getBackups() {
  return backupsOverviewSchema.parse(await api('GET', '/api/system/backups'))
}

export async function saveBackupConfig(input: SaveBackupConfigInput) {
  const body = saveBackupConfigSchema.parse(input)
  return backupConfigSchema.parse(await api('PUT', '/api/system/backups/config', { body }))
}

export async function runBackup() {
  return backupInfoSchema.parse(await api('POST', '/api/system/backups'))
}

export async function verifyBackup(path: string, passphrase: string) {
  return backupSummarySchema.parse(await api('POST', '/api/system/backups/verify', { body: { path, passphrase } }))
}

/** Stages the restore; the swap itself happens when the application restarts. */
export async function restoreBackup(path: string, passphrase: string) {
  return backupSummarySchema.parse(await api('POST', '/api/system/backups/restore', { body: { path, passphrase } }))
}

export async function restartApp() {
  if (isTauri()) await invoke('restart_app')
}

export async function getEnvironment() {
  return environmentSchema.parse(await api('GET', '/api/system/environment'))
}

export async function setNodeMode(serve: boolean, port?: number) {
  return environmentSchema.parse(await api('PUT', '/api/system/node-mode', { body: { serve, port } }))
}

export async function listDevices() {
  return z.array(deviceSchema).parse(await api('GET', '/api/auth/devices'))
}

export async function createEnrolmentCode(label: string) {
  return enrolmentCodeSchema.parse(await api('POST', '/api/auth/devices/enrolment-codes', { body: { label } }))
}

export async function revokeDevice(id: string) {
  await api('POST', `/api/auth/devices/${encodeURIComponent(id)}/revoke`)
}

/** This machine's own connection, answered locally even on a workstation. */
export async function getLocalConnection() {
  return localConnectionSchema.parse(await api('GET', '/api/system/local/connection'))
}

/** First launch on a workstation: enrol with a facility node. */
export async function connectToNode(input: ConnectToNodeInput) {
  const body = connectToNodeSchema.parse(input)
  await api('POST', '/api/system/onboarding/connect', { body })
}

export async function disconnectFromNode() {
  await api('POST', '/api/system/local/disconnect')
}
