import * as z from 'zod'

export const securityStatusSchema = z.object({
  /** `ready`, or `recovery` when the data could not be opened. */
  state: z.enum(['ready', 'recovery']),
  configured: z.boolean(),
  locked: z.boolean(),
  idleMinutes: z.number(),
  retryAfterSeconds: z.number(),
  reason: z.string().nullable(),
  /** Where the key that opens the data is held. */
  protection: z.enum(['keystore', 'key_file']).nullable(),
  lastBackupAt: z.number().nullable(),
  restorePending: z.boolean(),
})

export type SecurityStatus = z.infer<typeof securityStatusSchema>

export const auditEntrySchema = z.object({
  seq: z.number(),
  at: z.number(),
  actor: z.string().nullable(),
  action: z.string(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  fileId: z.string().nullable(),
  detail: z.string().nullable(),
  prevHash: z.string(),
  hash: z.string(),
})

export type AuditEntry = z.infer<typeof auditEntrySchema>

export const verificationSchema = z.object({ intact: z.boolean(), entries: z.number(), brokenAt: z.number().nullable() })

export const stagedSchema = z.object({ createdAt: z.number(), documents: z.number(), missing: z.number() })
export type Staged = z.infer<typeof stagedSchema>

export const idleChoices = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 0, label: 'Never' },
] as const

const actionLabels: Record<string, string> = {
  decision_recorded: 'Decision recorded',
  decision_corrected: 'Decision corrected',
  review_started: 'Charging review started',
  review_reopened: 'Decision reopened for review',
  document_issued: 'Document issued',
  document_discarded: 'Draft document discarded',
  attachment_added: 'Document attached',
  attachment_removed: 'Attachment removed',
  app_locked: 'Application locked',
  app_unlocked: 'Application unlocked',
  unlock_failed: 'Wrong passphrase entered',
  lock_enabled: 'Application lock turned on',
  lock_removed: 'Application lock turned off',
  lock_passphrase_changed: 'Lock passphrase changed',
  backup_created: 'Backup made',
  backup_restored: 'Backup restored',
}

export const auditActionLabel = (action: string) => actionLabels[action] ?? action
