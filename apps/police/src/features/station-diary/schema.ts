import * as m from '@/paraglide/messages'
import { isRichTextEmpty } from '@pleadli/rich-text'
import * as z from 'zod'

// The category list is the one already established in
// docs/police/PRODUCT.md's Station Diary section — not invented here.
export const stationDiaryCategories = [
  { value: 'incident_report', get label() { return m["diary.category.incident_report"]() } },
  { value: 'lost_property', get label() { return m["diary.category.lost_property"]() } },
  { value: 'public_inquiry', get label() { return m["diary.category.public_inquiry"]() } },
  { value: 'officer_movement', get label() { return m["diary.category.officer_movement"]() } },
  { value: 'shift_handover', get label() { return m["diary.category.shift_handover"]() } },
  { value: 'other', get label() { return m["diary.category.other"]() } },
] as const

export const stationDiaryEntrySchema = z.object({
  id: z.string(),
  category: z.string(),
  content: z.string(),
  personId: z.string().nullable(),
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personOtherNames: z.string().nullable(),
  entryYear: z.number().nullable(),
  entryNumber: z.number().nullable(),
  createdAt: z.number(),
})

export type StationDiaryEntry = z.infer<typeof stationDiaryEntrySchema>

export const createStationDiaryEntrySchema = z.object({
  category: z.string().min(1, { error: () => m["validation.category_is_required"]() }),
  content: z.string().refine((value) => !isRichTextEmpty(value), { error: () => m["validation.content_is_required"]() }),
  personId: z.string().nullable(),
})

export type CreateStationDiaryEntryInput = z.infer<typeof createStationDiaryEntrySchema>

export function stationDiaryCategoryLabel(category: string) {
  return stationDiaryCategories.find((c) => c.value === category)?.label ?? category
}

export function stationDiaryRelatedPersonName(entry: StationDiaryEntry) {
  if (!entry.personId) return null
  return [entry.personLastName, entry.personFirstName, entry.personOtherNames]
    .filter(Boolean)
    .join(', ')
}
