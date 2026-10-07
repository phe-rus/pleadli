import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const documentKinds = [
  { id: 'plaint', get label() { return m["document.kind.plaint"]() } },
  { id: 'written_statement_of_defence', get label() { return m["document.kind.written_statement_of_defence"]() } },
  { id: 'reply', get label() { return m["document.kind.reply"]() } },
  { id: 'affidavit', get label() { return m["document.kind.affidavit"]() } },
  { id: 'affidavit_of_service', get label() { return m["document.kind.affidavit_of_service"]() } },
  { id: 'notice_of_motion', get label() { return m["document.kind.notice_of_motion"]() } },
  { id: 'notice_of_appeal', get label() { return m["document.kind.notice_of_appeal"]() } },
  { id: 'memorandum_of_appeal', get label() { return m["document.kind.memorandum_of_appeal"]() } },
  { id: 'bail_application', get label() { return m["document.kind.bail_application"]() } },
  { id: 'engagement_letter', get label() { return m["document.kind.engagement_letter"]() } },
  { id: 'progress_letter', get label() { return m["document.kind.progress_letter"]() } },
  { id: 'registrar_letter', get label() { return m["document.kind.registrar_letter"]() } },
  { id: 'deed_poll', get label() { return m["template.deed_poll"]() } },
  { id: 'name_change_notice', get label() { return m["template.name_change_notice"]() } },
  { id: 'police_bond_letter', get label() { return m["template.police_bond_letter"]() } },
  { id: 'family_meeting_minutes', get label() { return m["template.family_meeting_minutes"]() } },
  { id: 'administrator_general_letter', get label() { return m["template.administrator_general_letter"]() } },
  { id: 'submissions', get label() { return m["document.kind.submissions"]() } },
  { id: 'mitigation', get label() { return m["document.kind.mitigation"]() } },
  { id: 'list_of_authorities', get label() { return m["document.kind.list_of_authorities"]() } },
  { id: 'demand_letter', get label() { return m["document.kind.demand_letter"]() } },
  { id: 'government_notice', get label() { return m["document.kind.government_notice"]() } },
  { id: 'sale_agreement', get label() { return m["document.kind.sale_agreement"]() } },
  { id: 'petition', get label() { return m["document.kind.petition"]() } },
  { id: 'legal_opinion', get label() { return m["document.kind.legal_opinion"]() } },
  { id: 'referral_letter', get label() { return m["document.kind.referral_letter"]() } },
  { id: 'letter', get label() { return m["document.kind.letter"]() } },
  { id: 'advice', get label() { return m["document.kind.advice"]() } },
  { id: 'general', get label() { return m["document.kind.general"]() } },
] as const
export const documentKindLabel = (id: string) => documentKinds.find((k) => k.id === id)?.label ?? id

export const documentContentSchema = z.object({
  advocate: z.string(),
  firm: z.string().nullable(),
  heading: z.string(),
  title: z.string(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  filedWith: z.string().nullable(),
  body: z.string(),
  filedOn: z.string(),
  firmAddress: z.string().nullish(),
  firmPhone: z.string().nullish(),
  firmEmail: z.string().nullish(),
  practisingNumber: z.string().nullish(),
  drawnBy: z.string().nullish(),
  signatureImage: z.string().nullish(),
  stampImage: z.string().nullish(),
  verifyCode: z.string().nullish(),
  verifyQr: z.string().nullish(),
})
export type DocumentContent = z.infer<typeof documentContentSchema>

export const documentSummarySchema = z.object({
  id: z.string(),
  matterId: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  filedOn: z.number().nullable(),
  updatedAt: z.number(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>

export const documentSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  content: documentContentSchema.nullable(),
  contentSha256: z.string().nullable(),
  intact: z.boolean().nullable(),
  filedOn: z.number().nullable(),
  filedWith: z.string().nullable(),
  filedAt: z.number().nullable(),
  filedBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
})
export type LawyerDocument = z.infer<typeof documentSchema>

export type CreateDocumentInput = { matterId: string; kind: string; title: string; body?: string }
export type UpdateDocumentInput = { title: string; body: string }

export const verificationSchema = z.object({
  result: z.enum(['genuine', 'mismatch', 'changed', 'not_found']),
  reference: z.string(),
  title: z.string().nullable(),
  filedOn: z.number().nullable(),
  filedBy: z.string().nullable(),
})
export type DocumentVerification = z.infer<typeof verificationSchema>
