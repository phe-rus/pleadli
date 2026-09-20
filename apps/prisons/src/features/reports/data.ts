import * as z from 'zod'
import { api } from '@/lib/api'
import { generatedReportSchema, receivedReturnSchema, reportRecordSchema, reportsSummarySchema, returnChecksSchema, type GenerateReportInput } from './schema'

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
