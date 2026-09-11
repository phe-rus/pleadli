import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { searchResultSchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function search(query: string) {
  const results = isTauri() ? await invoke('search', { query }) : await devFetch(`/search?query=${encodeURIComponent(query)}`)
  return z.array(searchResultSchema).parse(results)
}
