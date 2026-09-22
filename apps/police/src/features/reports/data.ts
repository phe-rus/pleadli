import { api } from '@/lib/api'
import { reportsSummarySchema } from './schema'

export async function getReportsSummary() {
  const summary = await api('/reports/summary')
  return reportsSummarySchema.parse(summary)
}
