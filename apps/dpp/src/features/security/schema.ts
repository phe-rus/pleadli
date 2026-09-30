import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const securityStatusSchema = z.object({
  /** `ready`, or `recovery` when the data could not be opened. */
  state: z.enum(['ready', 'recovery']),
  /** First-launch setup has been completed. */
  installed: z.boolean(),
  /** The protection level chosen at setup; null before it. */
  level: z.enum(['none', 'basic', 'full']).nullable(),
  configured: z.boolean(),
  locked: z.boolean(),
  /** Who is acting: the signed-in person, or with no sign-in the administrator. */
  actor: z
    .object({ id: z.string(), name: z.string(), rank: z.string().nullable(), role: z.enum(['administrator', 'prosecutor', 'clerk']), isDpp: z.boolean() })
    .nullable(),
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
  { minutes: 5, label: () => m["security.idle.minutes"]({ count: 5 }) },
  { minutes: 15, label: () => m["security.idle.minutes"]({ count: 15 }) },
  { minutes: 30, label: () => m["security.idle.minutes"]({ count: 30 }) },
  { minutes: 60, label: () => m["security.idle.hour"]() },
  { minutes: 0, label: () => m["security.idle.never"]() },
] as const

const actionLabels: Record<string, string> = {
  get decision_recorded() { return m["security.audit_action.decision_recorded"]() },
  get decision_corrected() { return m["security.audit_action.decision_corrected"]() },
  get review_started() { return m["security.audit_action.review_started"]() },
  get review_reopened() { return m["security.audit_action.review_reopened"]() },
  get document_issued() { return m["security.audit_action.document_issued"]() },
  get document_discarded() { return m["security.audit_action.document_discarded"]() },
  get attachment_added() { return m["security.audit_action.attachment_added"]() },
  get attachment_removed() { return m["security.audit_action.attachment_removed"]() },
  get app_locked() { return m["security.audit_action.app_locked"]() },
  get app_unlocked() { return m["security.audit_action.app_unlocked"]() },
  get unlock_failed() { return m["security.audit_action.unlock_failed"]() },
  get lock_enabled() { return m["security.audit_action.lock_enabled"]() },
  get lock_removed() { return m["security.audit_action.lock_removed"]() },
  get lock_passphrase_changed() { return m["security.audit_action.lock_passphrase_changed"]() },
  get backup_created() { return m["security.audit_action.backup_created"]() },
  get backup_restored() { return m["security.audit_action.backup_restored"]() },
  get setup_completed() { return m["security.audit_action.setup_completed"]() },
  get signed_in() { return m["security.audit_action.signed_in"]() },
  get signed_out() { return m["security.audit_action.signed_out"]() },
  get sign_in_failed() { return m["security.audit_action.sign_in_failed"]() },
  get second_factor_linked() { return m["security.audit_action.second_factor_linked"]() },
  get second_factor_reset() { return m["security.audit_action.second_factor_reset"]() },
  get staff_added() { return m["security.audit_action.staff_added"]() },
  get staff_changed() { return m["security.audit_action.staff_changed"]() },
  get staff_secret_set() { return m["security.audit_action.staff_secret_set"]() },
  get installation_changed() { return m["security.audit_action.installation_changed"]() },
  get protection_changed() { return m["security.audit_action.protection_changed"]() },
}

export const auditActionLabel = (action: string) => actionLabels[action] ?? action
