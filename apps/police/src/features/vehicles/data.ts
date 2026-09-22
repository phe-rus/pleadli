import { api } from '@/lib/api'
import * as z from 'zod'
import { createVehicleSchema, vehicleSchema, type CreateVehicleInput } from './schema'

function toRustInput(input: CreateVehicleInput) {
  return {
    ...input,
    make: input.make || null,
    model: input.model || null,
    color: input.color || null,
    notes: input.notes || null,
  }
}

export async function createVehicle(input: CreateVehicleInput) {
  const parsed = toRustInput(createVehicleSchema.parse(input))
  const vehicle = await api('/vehicles', { method: 'POST', body: JSON.stringify(parsed) })
  return vehicleSchema.parse(vehicle)
}

export async function updateVehicle(id: string, input: CreateVehicleInput) {
  const parsed = toRustInput(createVehicleSchema.parse(input))
  const vehicle = await api(`/vehicles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return vehicleSchema.parse(vehicle)
}

export async function listVehicles(query: string) {
  const vehicles = await api(`/vehicles?query=${encodeURIComponent(query)}`)
  return z.array(vehicleSchema).parse(vehicles)
}
