import * as z from 'zod'

export const auditEntrySchema = z.object({
  seq: z.number(),
  version: z.number(),
  at: z.number(),
  actor: z.string().nullable(),
  action: z.string(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  scopeId: z.string().nullable(),
  detail: z.string().nullable(),
  prevHash: z.string(),
  hash: z.string(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const verificationSchema = z.object({ intact: z.boolean(), entries: z.number(), brokenAt: z.number().nullable() })
export type Verification = z.infer<typeof verificationSchema>

const words: Record<string, string> = {
  profile_saved: 'Your details saved',
  client_added: 'Client added',
  client_updated: 'Client details changed',
  matter_opened: 'Matter opened',
  matter_updated: 'Matter details changed',
  matter_closed: 'Matter closed',
  matter_reopened: 'Matter reopened',
  hearing_scheduled: 'Hearing listed',
  hearing_rescheduled: 'Hearing moved',
  hearing_attended: 'Hearing attended',
  hearing_adjourned: 'Hearing adjourned',
  hearing_missed: 'Hearing missed',
  hearing_cancelled: 'Hearing cancelled',
  document_drafted: 'Document drafted',
  document_discarded: 'Draft discarded',
  document_filed: 'Document filed',
  plea_updated: 'Plea negotiation updated',
}
export const describeAction = (action: string) => words[action] ?? action
