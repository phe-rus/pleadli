import * as z from 'zod'
import { api } from '@/lib/api'
import {
  draftSchema,
  draftSummarySchema,
  generatedReportSchema,
  receivedReturnSchema,
  reportDocumentSchema,
  reportRecordSchema,
  reportsSummarySchema,
  returnChecksSchema,
  type Block,
  type GenerateReportInput,
} from './schema'

export async function getReportsSummary() {
  return reportsSummarySchema.parse(await api('GET', '/api/prisons/reports/summary'))
}

/** Every report this installation has produced, newest first. */
export async function listReports() {
  return z.array(reportRecordSchema).parse(await api('GET', '/api/prisons/reports'))
}

export async function getReport(id: string) {
  return generatedReportSchema.parse(await api('GET', `/api/prisons/reports/${encodeURIComponent(id)}`))
}

/** Produces and stores a numbered report (`report.generate`). */
export async function generateReport(input: GenerateReportInput) {
  return generatedReportSchema.parse(await api('POST', '/api/prisons/reports', { body: input }))
}

/** What must hold before a monthly return can be attested (`report.read`). */
export async function getReturnChecks(id: string) {
  return returnChecksSchema.parse(await api('GET', `/api/prisons/reports/${encodeURIComponent(id)}/checks`))
}

/** The officer in charge affirms the return. Final (`report.attest`). */
export async function attestReturn(id: string) {
  return generatedReportSchema.parse(await api('POST', `/api/prisons/reports/${encodeURIComponent(id)}/attest`))
}

/** Queues an attested return for Head Office and sends it if it can be
 * reached (`report.attest`). */
export async function submitReturn(id: string) {
  return generatedReportSchema.parse(await api('POST', `/api/prisons/reports/${encodeURIComponent(id)}/submit`))
}

/** Head Office: the returns facilities have sent (`hq.reports`). */
export async function listReceivedReturns() {
  return z.array(receivedReturnSchema).parse(await api('GET', '/api/prisons/returns/received'))
}

// ---- Composed reports ----

/** What a register would contain for a period, without storing anything (`report.read`). */
export async function previewReport(kind: string, from: number | null, to: number | null) {
  const query: Record<string, string> = { kind }
  if (from != null) query.from = String(from)
  if (to != null) query.to = String(to)
  return reportDocumentSchema.parse(await api('GET', '/api/prisons/reports/preview', { query }))
}

export async function listDrafts() {
  return z.array(draftSummarySchema).parse(await api('GET', '/api/prisons/report-drafts'))
}

export async function getDraft(id: string) {
  return draftSchema.parse(await api('GET', `/api/prisons/report-drafts/${encodeURIComponent(id)}`))
}

export async function createDraft(input: { title: string; blocks: readonly Block[] }) {
  return draftSchema.parse(await api('POST', '/api/prisons/report-drafts', { body: input }))
}

export async function saveDraft(id: string, input: { title: string; blocks: readonly Block[] }) {
  return draftSchema.parse(await api('PUT', `/api/prisons/report-drafts/${encodeURIComponent(id)}`, { body: input }))
}

/** Turns a draft into a numbered, fingerprinted report and freezes the draft. */
export async function issueDraft(id: string) {
  return generatedReportSchema.parse(await api('POST', `/api/prisons/report-drafts/${encodeURIComponent(id)}/issue`))
}
