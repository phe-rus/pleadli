import { invoke, isTauri } from '@tauri-apps/api/core'
import { cloudflareConfigSchema, saveCloudflareConfigSchema, type SaveCloudflareConfigInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text().catch(() => response.statusText))
  return response.status === 204 ? null : response.json()
}

/** Never returns the stored API token — see `save_cloudflare_config`'s own
 * doc comment (`domain/cloudflare_tunnel.rs`) for why. */
export async function getCloudflareConfig() {
  const config = isTauri() ? await invoke('get_cloudflare_config') : await devFetch('/cloudflare/config')
  return cloudflareConfigSchema.nullable().parse(config)
}

export async function saveCloudflareConfig(input: SaveCloudflareConfigInput) {
  const parsed = saveCloudflareConfigSchema.parse(input)
  if (isTauri()) {
    await invoke('save_cloudflare_config', { input: parsed })
    return
  }
  await devFetch('/cloudflare/config', { method: 'PUT', body: JSON.stringify(parsed) })
}
