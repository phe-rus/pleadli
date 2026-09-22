import * as z from 'zod'

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
