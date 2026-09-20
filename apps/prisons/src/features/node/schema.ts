import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const backupInfoSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
})
export type BackupInfo = z.infer<typeof backupInfoSchema>

export const backupConfigSchema = z.object({
  backupDir: z.string().nullable(),
  backupIntervalHours: z.number(),
  backupRetention: z.number(),
  lastBackupAt: z.number().nullable(),
  lastBackupStatus: z.string().nullable(),
  lastBackupError: z.string().nullable(),
  configured: z.boolean(),
  effectiveDir: z.string(),
})
export type BackupConfig = z.infer<typeof backupConfigSchema>

export const backupsOverviewSchema = z.object({
  config: backupConfigSchema,
  backups: z.array(backupInfoSchema),
})

export const backupSummarySchema = z.object({
  createdAt: z.number(),
  appVersion: z.string(),
  schemaVersion: z.number(),
  files: z.number(),
  auditEntries: z.number(),
})
export type BackupSummary = z.infer<typeof backupSummarySchema>

export const saveBackupConfigSchema = z.object({
  backupDir: z.string().nullable(),
  intervalHours: z.number().int().min(1, 'At least 1 hour.'),
  retention: z.number().int().min(1, 'Keep at least 1 backup.'),
  passphrase: z.string().nullable(),
})
export type SaveBackupConfigInput = z.infer<typeof saveBackupConfigSchema>

/** `GET /api/system/recovery`. `recovering` is true only when the node found
 * its database untrustworthy at startup and is serving nothing else. */
export const recoveryStatusSchema = z.object({
  recovering: z.boolean(),
  reason: z.string().optional(),
  defaultBackupDir: z.string().optional(),
})
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const environmentSchema = z.object({
  network: z.object({
    mode: z.enum(['standalone', 'node', 'client']),
    lanPort: z.number(),
    listening: z.boolean(),
    fingerprint: z.string().nullable(),
    addresses: z.array(z.string()),
    activeDevices: z.number(),
  }),
  headOffice: z.object({
    status: z.enum(['unpaired', 'connected', 'behind', 'offline', 'pending_verification', 'rejected', 'degraded']),
    lastSyncedAt: z.number().nullable(),
    lastError: z.string().nullable(),
  }),
  backup: z.object({
    configured: z.boolean(),
    lastBackupAt: z.number().nullable(),
    overdue: z.boolean(),
  }),
})
export type Environment = z.infer<typeof environmentSchema>

export const deviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  enrolledAt: z.number(),
  lastSeenAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
})
export type Device = z.infer<typeof deviceSchema>

export const enrolmentCodeSchema = z.object({ code: z.string(), expiresAt: z.number() })
export type EnrolmentCode = z.infer<typeof enrolmentCodeSchema>

export const localConnectionSchema = z.object({
  mode: z.enum(['standalone', 'node', 'client']),
  nodeUrl: z.string().nullable(),
})

export const connectToNodeSchema = z.object({
  address: z.string().min(1, 'Enter the node address.'),
  fingerprint: z.string().min(1, 'Enter the fingerprint shown on the node.'),
  code: z.string().min(1, 'Enter the enrolment code shown on the node.'),
})
export type ConnectToNodeInput = z.infer<typeof connectToNodeSchema>

/** What the connection strip says. Explicit, never optimistic: "connected"
 * only appears when the last exchange actually succeeded recently. */
export function headOfficeLabel(status: Environment['headOffice']['status']) {
  switch (status) {
    case 'unpaired':
      return m.node_not_paired_with_head_office()
    case 'connected':
      return m.node_head_office_connected()
    case 'behind':
      return m.node_head_office_waiting_to_send()
    case 'offline':
      return m.node_head_office_not_reachable()
    case 'pending_verification':
      return m.node_head_office_awaiting_approval()
    case 'rejected':
      return m.node_head_office_rejected_this_installation()
    case 'degraded':
      return m.node_head_office_last_exchange_failed()
  }
}
