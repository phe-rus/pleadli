import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const stationAssetCategories = [
  { value: 'armory', get label() { return m["assets.category.armory"]() } },
  { value: 'impounded', get label() { return m["assets.category.impounded"]() } },
] as const

export const stationAssetStatuses = [
  { value: 'in_store', get label() { return m["assets.status.in_store"]() } },
  { value: 'issued', get label() { return m["assets.status.issued"]() } },
  { value: 'released', get label() { return m["assets.status.released"]() } },
  { value: 'disposed', get label() { return m["assets.status.disposed"]() } },
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
  category: z.string().min(1, { error: () => m["validation.category_is_required"]() }),
  description: z.string().min(1, { error: () => m["validation.description_is_required"]() }),
  itemIdentifier: z.string(),
  status: z.string().min(1, { error: () => m["validation.status_is_required"]() }),
  holderName: z.string(),
  personId: z.string().nullable(),
  notes: z.string(),
})

export type CreateStationAssetInput = z.infer<typeof createStationAssetSchema>

export function stationAssetPersonName(asset: StationAsset) {
  if (!asset.personId) return null
  return [asset.personLastName, asset.personFirstName, asset.personOtherNames].filter(Boolean).join(', ')
}
