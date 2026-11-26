import { api } from '@/lib/api'
import { capabilitiesSchema, grantSchema, type CapabilityKey, type RoleKey } from './schema'
import * as z from 'zod'

export const getMyCapabilities = async () => capabilitiesSchema.parse(await api('GET', '/api/capabilities/mine'))
export const getGrants = async () => z.array(grantSchema).parse(await api('GET', '/api/capabilities'))
export const setGrant = async (role: RoleKey, capability: CapabilityKey, granted: boolean) =>
  z.array(grantSchema).parse(await api('PUT', '/api/capabilities', { body: { role, capability, granted } }))
