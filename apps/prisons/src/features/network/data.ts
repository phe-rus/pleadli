import { api } from '@/lib/api'
import { cloudflareConfigSchema, saveCloudflareConfigSchema, tunnelProvisionedSchema, type SaveCloudflareConfigInput } from './schema'

/** Never returns the stored API token: the node's config type has no such
 * field. Head Office only (`hq.network.manage`). */
export async function getCloudflareConfig() {
  return cloudflareConfigSchema.nullable().parse(await api('GET', '/api/hq/network/cloudflare'))
}

export async function saveCloudflareConfig(input: SaveCloudflareConfigInput) {
  const body = saveCloudflareConfigSchema.parse(input)
  await api('PUT', '/api/hq/network/cloudflare', { body })
}

/** Creates (or reuses) this Head Office's Cloudflare tunnel from the saved
 * details and points its address at the network listener. Safe to repeat.
 * `hq.network.manage`. */
export async function provisionCloudflareTunnel() {
  return tunnelProvisionedSchema.parse(await api('POST', '/api/hq/network/cloudflare/provision'))
}
