import * as z from 'zod'

// The verified sub-county staffing roles (docs/police/PRODUCT.md, audit
// §G.9 — OPM) — offered as UI suggestions only, never enforced. A station
// can have any number of officers in any posts, or none recorded yet.
export const stationEstablishmentPostSuggestions = [
  'OC Station',
  'OC CID',
  'Crime Intelligence Officer',
  'Child & Family Protection Officer',
  'Community Liaison Officer',
  'General Officer',
] as const

export const stationProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  contact: z.string().nullable(),
  ocStationName: z.string().nullable(),
  ocStationRank: z.string().nullable(),
  createdAt: z.number(),
})

export type StationProfile = z.infer<typeof stationProfileSchema>

export const saveStationProfileSchema = z.object({
  name: z.string(),
  address: z.string(),
  jurisdiction: z.string(),
  contact: z.string(),
  ocStationName: z.string(),
  ocStationRank: z.string(),
})

export type SaveStationProfileInput = z.infer<typeof saveStationProfileSchema>

// References the existing Person record — see the migration's own
// comment. Only `post`/`rank`/`active` are genuinely new information the
// Person record doesn't own.
export const stationEstablishmentMemberSchema = z.object({
  id: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
  post: z.string().nullable(),
  rank: z.string().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type StationEstablishmentMember = z.infer<typeof stationEstablishmentMemberSchema>

export const createStationEstablishmentMemberSchema = z.object({
  personId: z.string().min(1, 'Person is required.'),
  post: z.string(),
  rank: z.string(),
  active: z.boolean(),
  notes: z.string(),
})

export type CreateStationEstablishmentMemberInput = z.infer<typeof createStationEstablishmentMemberSchema>

export function establishmentPersonName(
  member: Pick<StationEstablishmentMember, 'personFirstName' | 'personLastName' | 'personOtherNames'>,
) {
  return [member.personLastName, member.personFirstName, member.personOtherNames].filter(Boolean).join(', ')
}
