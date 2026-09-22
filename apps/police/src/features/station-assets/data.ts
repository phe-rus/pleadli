import { api } from '@/lib/api'
import * as z from 'zod'
import { createStationAssetSchema, stationAssetSchema, type CreateStationAssetInput } from './schema'

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
  const asset = await api('/station-assets', { method: 'POST', body: JSON.stringify(parsed) })
  return stationAssetSchema.parse(asset)
}

export async function updateStationAsset(id: string, input: CreateStationAssetInput) {
  const parsed = toRustInput(createStationAssetSchema.parse(input))
  const asset = await api(`/station-assets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return stationAssetSchema.parse(asset)
}

export async function listStationAssets(query: string) {
  const assets = await api(`/station-assets?query=${encodeURIComponent(query)}`)
  return z.array(stationAssetSchema).parse(assets)
}
