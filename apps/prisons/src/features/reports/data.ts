import { invoke, isTauri } from '@tauri-apps/api/core'
import { reportsSummarySchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

export async function getReportsSummary() {
  const summary = isTauri()
    ? await invoke('get_reports_summary')
    : await (await fetch(`${DEV_SERVER_URL}/reports/summary`)).json()
  return reportsSummarySchema.parse(summary)
}
