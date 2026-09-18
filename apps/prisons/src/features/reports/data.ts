import { api } from '@/lib/api'
import { reportsSummarySchema } from './schema'

export async function getReportsSummary() {
  return reportsSummarySchema.parse(await api('GET', '/api/prisons/reports/summary'))
}
