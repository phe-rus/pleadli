import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createVehicleSchema, vehicleSchema, type CreateVehicleInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

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
  const vehicle = isTauri()
    ? await invoke('create_vehicle', { input: parsed })
    : await devFetch('/vehicles', { method: 'POST', body: JSON.stringify(parsed) })
  return vehicleSchema.parse(vehicle)
}

export async function updateVehicle(id: string, input: CreateVehicleInput) {
  const parsed = toRustInput(createVehicleSchema.parse(input))
  const vehicle = isTauri()
    ? await invoke('update_vehicle', { id, input: parsed })
    : await devFetch(`/vehicles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return vehicleSchema.parse(vehicle)
}

export async function listVehicles(query: string) {
  const vehicles = isTauri()
    ? await invoke('list_vehicles', { query })
    : await devFetch(`/vehicles?query=${encodeURIComponent(query)}`)
  return z.array(vehicleSchema).parse(vehicles)
}
