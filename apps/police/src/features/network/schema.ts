import * as m from '@/paraglide/messages'
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
  apiToken: z.string().min(1, { error: () => m["validation.api_token_is_required"]() }),
  accountId: z.string().min(1, { error: () => m["validation.account_id_is_required"]() }),
  domain: z.string().min(1, { error: () => m["validation.domain_is_required"]() }),
  stationName: z
    .string()
    .min(1, { error: () => m["validation.station_name_is_required"]() })
    .regex(/^[a-z0-9-]+$/, { error: () => m["validation.lowercase_letters_numbers_and_hyphens_only"]() }),
})

export type SaveCloudflareConfigInput = z.infer<typeof saveCloudflareConfigSchema>

export const tunnelStateSchema = z.object({
  tunnelId: z.string(),
  hostname: z.string(),
})

export type TunnelState = z.infer<typeof tunnelStateSchema>
