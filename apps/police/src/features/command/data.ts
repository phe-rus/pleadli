import { api } from '@/lib/api'
import * as z from 'zod'
import {
  activationCodeSchema,
  overviewSchema,
  pendingRequestSchema,
  registerStationSchema,
  rosterEntrySchema,
  stationSchema,
  type RegisterStationInput,
} from './schema'

export async function listStations() {
  return z.array(stationSchema).parse(await api('/hq/stations'))
}

export async function getOverview() {
  return overviewSchema.parse(await api('/hq/overview'))
}

export async function listPendingRequests() {
  return z.array(pendingRequestSchema).parse(await api('/hq/requests'))
}

export async function registerStation(input: RegisterStationInput) {
  const parsed = registerStationSchema.parse(input)
  const body = { name: parsed.name.trim(), region: parsed.region.trim() || null, district: parsed.district.trim() || null }
  return z.object({ id: z.string(), stationNumber: z.string(), name: z.string() }).parse(await api('/hq/stations', { method: 'POST', body: JSON.stringify(body) }))
}

export async function issueActivationCode(stationId: string) {
  return activationCodeSchema.parse(await api(`/hq/stations/${encodeURIComponent(stationId)}/activation-code`, { method: 'POST' }))
}

export async function revokeStation(stationId: string) {
  await api(`/hq/stations/${encodeURIComponent(stationId)}/revoke`, { method: 'POST' })
}

export async function decideRequest(requestId: string, approve: boolean) {
  await api(`/hq/requests/${encodeURIComponent(requestId)}/${approve ? 'approve' : 'reject'}`, { method: 'POST' })
}

export async function listRoster(stationId: string) {
  return z.array(rosterEntrySchema).parse(await api(`/hq/stations/${encodeURIComponent(stationId)}/roster`))
}

export async function getListener() {
  return z.object({ address: z.string().nullable(), port: z.number() }).parse(await api('/hq/listener'))
}
