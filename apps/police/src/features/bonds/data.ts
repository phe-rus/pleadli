import { api } from '@/lib/api'
import * as z from 'zod'
import { bondSchema, createBondSchema, type CreateBondInput } from './schema'

function toRustInput(input: CreateBondInput) {
  return {
    ...input,
    lockUpSerialNumber: input.lockUpSerialNumber || null,
    suretyName: input.suretyName || null,
    suretyContact: input.suretyContact || null,
    reportingSchedule: input.reportingSchedule || null,
    officerName: input.officerName || null,
    officerRank: input.officerRank || null,
    notes: input.notes || null,
  }
}

export async function createBond(input: CreateBondInput) {
  const parsed = toRustInput(createBondSchema.parse(input))
  const bond = await api('/bonds', { method: 'POST', body: JSON.stringify(parsed) })
  return bondSchema.parse(bond)
}

export async function updateBond(id: string, input: CreateBondInput) {
  const parsed = toRustInput(createBondSchema.parse(input))
  const bond = await api(`/bonds/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return bondSchema.parse(bond)
}

export async function listBonds(query: string) {
  const bonds = await api(`/bonds?query=${encodeURIComponent(query)}`)
  return z.array(bondSchema).parse(bonds)
}
