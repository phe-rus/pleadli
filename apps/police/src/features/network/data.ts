import { api } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  cloudflareConfigSchema,
  localNetworkInfoSchema,
  remoteAccessStatusSchema,
  saveCloudflareConfigSchema,
  tunnelStateSchema,
  type SaveCloudflareConfigInput,
} from './schema'

export async function getRemoteAccessStatus() {
  if (isTauri()) {
    return remoteAccessStatusSchema.parse(await invoke('get_remote_access_status'))
  }
  const settings = await api('/remote-access/settings')
  return remoteAccessStatusSchema.parse({ enabled: settings.enabled, hostname: null })
}

/**
 * Starting/stopping the local server and the Cloudflare sidecar both
 * need a real OS process — only possible from the desktop app itself.
 * The browser dev fallback can only flip the underlying flag, with no
 * server or tunnel actually starting, which is an honest reflection of
 * what a plain browser session can do.
 */
export async function setRemoteAccessEnabled(enabled: boolean) {
  if (isTauri()) {
    return remoteAccessStatusSchema.parse(await invoke('set_remote_access_enabled', { enabled }))
  }
  const settings = await api('/remote-access/settings', { method: 'PUT', body: JSON.stringify({ enabled }) })
  return remoteAccessStatusSchema.parse({ enabled: settings.enabled, hostname: null })
}

export async function getLocalNetworkInfo() {
  const info = isTauri() ? await invoke('get_local_network_info') : await api('/local-network')
  return localNetworkInfoSchema.parse(info)
}

export async function getLocalPairingQr() {
  if (!isTauri()) return null
  const svg = await invoke('get_local_pairing_qr')
  return typeof svg === 'string' ? svg : null
}

export async function getCloudflareConfig() {
  const config = isTauri() ? await invoke('get_cloudflare_config') : await api('/cloudflare/config')
  return cloudflareConfigSchema.nullable().parse(config)
}

export async function saveCloudflareConfig(input: SaveCloudflareConfigInput) {
  const parsed = saveCloudflareConfigSchema.parse(input)
  if (isTauri()) {
    await invoke('save_cloudflare_config', { input: parsed })
    return
  }
  await api('/cloudflare/config', { method: 'PUT', body: JSON.stringify(parsed) })
}

export async function getCloudflareTunnelState() {
  const state = isTauri()
    ? await invoke('get_cloudflare_tunnel_state')
    : await api('/cloudflare/tunnel-state')
  return tunnelStateSchema.nullable().parse(state)
}
