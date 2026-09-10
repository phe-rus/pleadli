import { invoke, isTauri } from '@tauri-apps/api/core'
import { reportsSummarySchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function getReportsSummary() {
  const summary = isTauri()
    ? await invoke('get_reports_summary')
    : await devFetch('/reports/summary')
  return reportsSummarySchema.parse(summary)
}
