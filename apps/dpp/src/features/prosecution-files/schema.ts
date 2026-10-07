import * as z from 'zod'
import * as m from '@/paraglide/messages'

// Mirrors docs/dpp/PRODUCT.md §Decisions & Reviews's confirmed status
// buckets — a cached queue-bucket on the file, not the audit trail itself
// (see features/decisions for that).
export const fileStatuses = [
  { value: 'under_review', get label() { return m["file.status.under_review"]() } },
  { value: 'resubmitted', get label() { return m["file.status.resubmitted"]() } },
  { value: 'sanctioned', get label() { return m["file.status.sanctioned"]() } },
  { value: 'declined', get label() { return m["file.status.declined"]() } },
  { value: 'diverted', get label() { return m["file.status.diverted"]() } },
  { value: 'returned_for_investigation', get label() { return m["file.status.returned_for_investigation"]() } },
  { value: 'taken_over', get label() { return m["file.status.taken_over"]() } },
  { value: 'discontinued', get label() { return m["file.status.discontinued"]() } },
  { value: 'plea_bargained', get label() { return m["file.status.plea_bargained"]() } },
] as const

export function fileStatusLabel(status: string) {
  return fileStatuses.find((s) => s.value === status)?.label ?? status
}

/** How a status reads at a glance: `open` needs the prosecutor, `waiting` is
 * with Police, `done` has had its charging decision. Colour follows this and
 * never carries the meaning alone. */
export type StatusTone = 'open' | 'waiting' | 'done' | 'stopped'

export function fileStatusTone(status: string): StatusTone {
  if (status === 'under_review' || status === 'resubmitted') return 'open'
  if (status === 'returned_for_investigation') return 'waiting'
  if (status === 'sanctioned' || status === 'plea_bargained') return 'done'
  return 'stopped'
}

/** The slices of the register (server: `view_filter`). Each says what it is,
 * because the same file is in exactly one of them. */
export const fileViews = [
  { id: 'intake', get label() { return m["file.view.intake.label"]() }, get about() { return m["file.view.intake.about"]() } },
  { id: 'active', get label() { return m["file.view.active.label"]() }, get about() { return m["file.view.active.about"]() } },
  { id: 'returned', get label() { return m["file.view.returned.label"]() }, get about() { return m["file.view.returned.about"]() } },
  { id: 'reopened', get label() { return m["file.view.reopened.label"]() }, get about() { return m["file.view.reopened.about"]() } },
  { id: 'closed', get label() { return m["file.view.closed.label"]() }, get about() { return m["file.view.closed.about"]() } },
  { id: 'all', get label() { return m["file.view.all.label"]() }, get about() { return m["file.view.all.about"]() } },
  { id: 'receive', get label() { return m["folder.receive"]() }, get about() { return m["stage.pipe.receive_about"]() } },
  { id: 'review', get label() { return m["folder.review"]() }, get about() { return m["stage.pipe.review_about"]() } },
  { id: 'decide', get label() { return m["folder.decide"]() }, get about() { return m["stage.pipe.decide_about"]() } },
  { id: 'prepare', get label() { return m["folder.prepare"]() }, get about() { return m["stage.pipe.prepare_about"]() } },
  { id: 'handover', get label() { return m["folder.handover"]() }, get about() { return m["stage.pipe.handover_about"]() } },
  { id: 'follow_up', get label() { return m["folder.follow_up"]() }, get about() { return m["stage.pipe.follow_up_about"]() } },
  { id: 'concluded', get label() { return m["folder.concluded"]() }, get about() { return m["stage.pipe.concluded_about"]() } },
] as const

/** The folders in the sidebar, in the order the work moves: every file, then
 * one folder per stage (the same stages the file's own steps show), and the
 * files that are back with Police. A file is in exactly one stage. */
export const fileFolders = ['all', 'receive', 'review', 'decide', 'prepare', 'handover', 'follow_up', 'returned', 'concluded'] as const satisfies readonly FileViewId[]
export type FileFolderId = (typeof fileFolders)[number]

export type FileViewId = (typeof fileViews)[number]['id']

export function isFileView(value: unknown): value is FileViewId {
  return fileViews.some((view) => view.id === value)
}

/** What identifies a file to the person holding it: ODPP number, else Police
 * reference, else the short id. */
export function fileReference(file: Pick<ProsecutionFile, 'id' | 'odppRegistrationNumber' | 'policeReference'>) {
  return file.odppRegistrationNumber || file.policeReference || file.id.slice(0, 8)
}

export const prosecutionFileSchema = z.object({
  id: z.string(),
  odppRegistrationNumber: z.string().nullable(),
  title: z.string(),
  policeStation: z.string().nullable(),
  policeReference: z.string().nullable(),
  courtCaseNumber: z.string().nullable(),
  currentStatus: z.string(),
  receivedAt: z.number(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  policeConnectionId: z.string().nullable(),
  stage: z.enum(['receive', 'review', 'decide', 'prepare', 'handover', 'follow_up', 'concluded']).catch('receive'),
  stageChangedAt: z.number().nullable().catch(null),
  outcome: z.string().nullable().catch(null),
  concludedAt: z.number().nullable().catch(null),
})

export type ProsecutionFile = z.infer<typeof prosecutionFileSchema>

export const fileSummarySchema = prosecutionFileSchema.extend({
  awaitingSince: z.number(),
  accused: z.string().nullable(),
  reviewNoteCount: z.number(),
  statementCount: z.number(),
  chargeCount: z.number(),
  decisionCount: z.number(),
  lastDecisionType: z.string().nullable(),
  lastDecisionAt: z.number().nullable(),
  lastActivityAt: z.number(),
  openReviewId: z.string().nullable(),
  openReviewStandard: z.string().nullable(),
  reopened: z.boolean(),
  directionsTotal: z.number(),
  directionsOpen: z.number(),
})

export type FileSummary = z.infer<typeof fileSummarySchema>


export const createProsecutionFileSchema = z.object({
  odppRegistrationNumber: z.string(),
  title: z.string().min(1, { error: () => m["file.form.title_required"]() }),
  policeStation: z.string(),
  policeReference: z.string(),
  receivedAt: z.number(),
  materialSummary: z.string(),
  notes: z.string(),
})

export type CreateProsecutionFileInput = z.infer<typeof createProsecutionFileSchema>

export const updateProsecutionFileSchema = z.object({
  odppRegistrationNumber: z.string(),
  title: z.string().min(1, { error: () => m["file.form.title_required"]() }),
  policeStation: z.string(),
  policeReference: z.string(),
  courtCaseNumber: z.string(),
  notes: z.string(),
})

export type UpdateProsecutionFileInput = z.infer<typeof updateProsecutionFileSchema>

export const filePersonRoles = [
  { value: 'accused', get label() { return m["file.role.accused"]() } },
  { value: 'complainant', get label() { return m["file.role.complainant"]() } },
  { value: 'witness', get label() { return m["file.role.witness"]() } },
] as const

export const prosecutionFilePersonSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  personId: z.string(),
  role: z.string(),
  createdAt: z.number(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
})

export type ProsecutionFilePerson = z.infer<typeof prosecutionFilePersonSchema>

export function personFullNameForRole(link: Pick<ProsecutionFilePerson, 'personFirstName' | 'personLastName' | 'personOtherNames'>) {
  return [link.personLastName, link.personFirstName, link.personOtherNames].filter(Boolean).join(', ')
}
