import { api, seg } from '@/lib/api'
import { queryOptions, useMutation } from '@tanstack/react-query'
import * as z from 'zod'

const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pairedAt: z.number(),
  pairedBy: z.string().nullable(),
  lastSeenAt: z.number().nullable(),
  lastAddress: z.string().nullable(),
  revokedAt: z.number().nullable(),
  revokedBy: z.string().nullable(),
})
export type Device = z.infer<typeof deviceSchema>

export const networkSchema = z.object({
  mode: z.enum(['standalone', 'office', 'terminal']),
  addresses: z.array(z.string()),
  fingerprint: z.string().nullable(),
  listening: z.boolean(),
  devices: z.array(deviceSchema),
  officeAddress: z.string().nullable(),
  officeName: z.string().nullable(),
  officeFingerprint: z.string().nullable(),
  joinedAt: z.number().nullable(),
  reachable: z.boolean().nullable(),
})
export type NetworkStatus = z.infer<typeof networkSchema>

const probeSchema = z.object({ address: z.string(), fingerprint: z.string(), officeName: z.string().nullable() })
export type Probe = z.infer<typeof probeSchema>

const codeSchema = z.object({ code: z.string(), expiresAt: z.number() })
export type PairingCode = z.infer<typeof codeSchema>

/** Never passed to the office: this computer's own place in the firm. */
export const networkOptions = () => queryOptions({ queryKey: ['network'] as const, queryFn: async () => networkSchema.parse(await api('GET', '/api/network')), retry: false })

export const useSetOffice = () => useMutation({ mutationFn: async (on: boolean) => networkSchema.parse(await api('PUT', '/api/network/office', { body: { on } })) })
export const usePairingCode = () => useMutation({ mutationFn: async () => codeSchema.parse(await api('POST', '/api/network/pairing-code', { body: {} })) })
export const useRemoveDevice = () => useMutation({ mutationFn: async (id: string) => networkSchema.parse(await api('DELETE', `/api/network/devices/${seg(id)}`)) })
export const useProbe = () => useMutation({ mutationFn: async (address: string) => probeSchema.parse(await api('POST', '/api/network/probe', { body: { address } })) })
export const useJoin = () =>
  useMutation({
    mutationFn: async (input: { address: string; fingerprint: string; code: string; deviceName: string }) => networkSchema.parse(await api('POST', '/api/network/join', { body: input })),
  })
export const useLeave = () => useMutation({ mutationFn: async () => networkSchema.parse(await api('POST', '/api/network/leave', { body: {} })) })

/** "AB:CD:..." as sixteen groups of four, the same on both screens. */
export function fingerprintGroups(fingerprint: string): string[] {
  const hex = fingerprint.replace(/[^0-9a-f]/gi, '').toUpperCase()
  return hex.match(/.{1,4}/g) ?? []
}
