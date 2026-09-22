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
  profile_saved: 'Bench details saved',
  case_registered: 'Case registered',
  case_updated: 'Case details changed',
  case_concluded: 'Case concluded',
  case_reopened: 'Case reopened',
  party_added: 'Person added to a case',
  party_updated: 'Person changed',
  party_removed: 'Person removed from a case',
  sitting_scheduled: 'Sitting scheduled',
  sitting_rescheduled: 'Sitting moved',
  sitting_held: 'Sitting held',
  sitting_adjourned: 'Sitting adjourned',
  sitting_cancelled: 'Sitting cancelled',
  order_drafted: 'Order drafted',
  order_edited: 'Draft order changed',
  order_discarded: 'Draft order discarded',
  order_issued: 'Order issued',
  appearances_taken: 'Appearances listed',
  record_signed: 'Record of a sitting signed',
  exhibit_marked: 'Exhibit marked',
  exhibit_ruled_on: 'Court ruled on an exhibit',
  exhibit_removed: 'Exhibit mark taken back',
  ruling_drafted: 'Decision drafted',
  ruling_discarded: 'Draft decision discarded',
  ruling_delivered: 'Decision delivered',
  recording_started: 'Recording started',
  recording_stopped: 'Recording stopped',
  recording_interrupted: 'Recording cut short and closed',
  passage_adopted: 'Transcript passage adopted into the record',
  library_added: 'Text added to the library',
  library_edited: 'Library text changed',
  library_removed: 'Text removed from the library',
}
export const describeAction = (action: string) => words[action] ?? action
