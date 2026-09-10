import * as z from 'zod'

export const stationAssetCategories = [
  { value: 'armory', label: 'Armory' },
  { value: 'impounded', label: 'Impounded' },
] as const

export const stationAssetStatuses = [
  { value: 'in_store', label: 'In store' },
  { value: 'issued', label: 'Issued' },
  { value: 'released', label: 'Released' },
  { value: 'disposed', label: 'Disposed' },
] as const

export function stationAssetStatusLabel(status: string) {
  return stationAssetStatuses.find((s) => s.value === status)?.label ?? status
}

export const stationAssetSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  itemIdentifier: z.string().nullable(),
  status: z.string(),
  holderName: z.string().nullable(),
  personId: z.string().nullable(),
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personOtherNames: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type StationAsset = z.infer<typeof stationAssetSchema>

export const createStationAssetSchema = z.object({
  category: z.string().min(1, 'Category is required.'),
  description: z.string().min(1, 'Description is required.'),
  itemIdentifier: z.string(),
  status: z.string().min(1, 'Status is required.'),
  holderName: z.string(),
  personId: z.string().nullable(),
  notes: z.string(),
})

export type CreateStationAssetInput = z.infer<typeof createStationAssetSchema>

export function stationAssetPersonName(asset: StationAsset) {
  if (!asset.personId) return null
  return [asset.personLastName, asset.personFirstName, asset.personOtherNames].filter(Boolean).join(', ')
}
