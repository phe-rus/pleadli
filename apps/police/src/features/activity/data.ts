import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { activityItemSchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function listRecentActivity() {
  const items = isTauri() ? await invoke('list_recent_activity') : await devFetch('/activity/recent')
  return z.array(activityItemSchema).parse(items)
}
