import * as z from 'zod'

export const facilityProfileSchema = z.object({
  name: z.string().nullable(),
  facilityNumber: z.string().nullable(),
  location: z.string().nullable(),
  region: z.string().nullable(),
  approvedCapacity: z.number().nullable(),
  updatedAt: z.number().nullable(),
})

export type FacilityProfile = z.infer<typeof facilityProfileSchema>

export const saveFacilityProfileSchema = z.object({
  name: z.string().min(1, 'Facility name is required.'),
  facilityNumber: z.string(),
  location: z.string(),
  region: z.string(),
  approvedCapacity: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0), 'Enter a whole number of places, or leave blank.'),
})

export type SaveFacilityProfileInput = z.infer<typeof saveFacilityProfileSchema>
