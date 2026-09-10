import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createStationAssetSchema, stationAssetSchema, type CreateStationAssetInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateStationAssetInput) {
  return {
    ...input,
    itemIdentifier: input.itemIdentifier || null,
    holderName: input.holderName || null,
    notes: input.notes || null,
  }
}

export async function createStationAsset(input: CreateStationAssetInput) {
  const parsed = toRustInput(createStationAssetSchema.parse(input))
  const asset = isTauri()
    ? await invoke('create_station_asset', { input: parsed })
    : await devFetch('/station-assets', { method: 'POST', body: JSON.stringify(parsed) })
  return stationAssetSchema.parse(asset)
}

export async function updateStationAsset(id: string, input: CreateStationAssetInput) {
  const parsed = toRustInput(createStationAssetSchema.parse(input))
  const asset = isTauri()
    ? await invoke('update_station_asset', { id, input: parsed })
    : await devFetch(`/station-assets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return stationAssetSchema.parse(asset)
}

export async function listStationAssets(query: string) {
  const assets = isTauri()
    ? await invoke('list_station_assets', { query })
    : await devFetch(`/station-assets?query=${encodeURIComponent(query)}`)
  return z.array(stationAssetSchema).parse(assets)
}
