import * as z from 'zod'

/** Head Office's own Cloudflare Tunnel config, ported from Police's
 * identical shape (spec: docs/specs/prisons/0001-head-office-peer-sync-
 * network/0002-peer-registration-and-pairing.md) — what makes `hq_server`
 * reachable from anywhere so facilities can register and sync. */
export const cloudflareConfigSchema = z.object({
  accountId: z.string(),
  domain: z.string(),
  stationName: z.string(),
})

export type CloudflareConfig = z.infer<typeof cloudflareConfigSchema>

export const saveCloudflareConfigSchema = z.object({
  apiToken: z.string().min(1, 'API token is required.'),
  accountId: z.string().min(1, 'Account ID is required.'),
  domain: z.string().min(1, 'Domain is required.'),
  stationName: z
    .string()
    .min(1, 'Station name is required.')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only.'),
})

/** What setting up the tunnel answers with: the public address, nothing secret. */
export const tunnelProvisionedSchema = z.object({ hostname: z.string(), connector: z.enum(['running', 'stopped', 'missing']) })

export type SaveCloudflareConfigInput = z.infer<typeof saveCloudflareConfigSchema>
