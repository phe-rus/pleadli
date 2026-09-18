import { api } from '@/lib/api'
import { cloudflareConfigSchema, saveCloudflareConfigSchema, type SaveCloudflareConfigInput } from './schema'

/** Never returns the stored API token: the node's config type has no such
 * field. Head Office only (`hq.network.manage`). */
export async function getCloudflareConfig() {
  return cloudflareConfigSchema.nullable().parse(await api('GET', '/api/hq/network/cloudflare'))
}

export async function saveCloudflareConfig(input: SaveCloudflareConfigInput) {
  const body = saveCloudflareConfigSchema.parse(input)
  await api('PUT', '/api/hq/network/cloudflare', { body })
}
