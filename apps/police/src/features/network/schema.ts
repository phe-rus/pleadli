import * as z from 'zod'

export const remoteAccessStatusSchema = z.object({
  enabled: z.boolean(),
  hostname: z.string().nullable(),
})

export type RemoteAccessStatus = z.infer<typeof remoteAccessStatusSchema>

export const localNetworkInfoSchema = z.object({
  address: z.string().nullable(),
  port: z.number(),
})

export type LocalNetworkInfo = z.infer<typeof localNetworkInfoSchema>

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

export type SaveCloudflareConfigInput = z.infer<typeof saveCloudflareConfigSchema>

export const tunnelStateSchema = z.object({
  tunnelId: z.string(),
  hostname: z.string(),
})

export type TunnelState = z.infer<typeof tunnelStateSchema>
