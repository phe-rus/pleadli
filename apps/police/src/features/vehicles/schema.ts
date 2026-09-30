import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const vehicleSchema = z.object({
  id: z.string(),
  plateNumber: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  color: z.string().nullable(),
  ownerPersonId: z.string().nullable(),
  ownerFirstName: z.string().nullable(),
  ownerLastName: z.string().nullable(),
  ownerOtherNames: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Vehicle = z.infer<typeof vehicleSchema>

export const createVehicleSchema = z.object({
  plateNumber: z.string().min(1, { error: () => m["validation.plate_number_is_required"]() }),
  make: z.string(),
  model: z.string(),
  color: z.string(),
  ownerPersonId: z.string().nullable(),
  notes: z.string(),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>

export function vehicleOwnerName(vehicle: Vehicle) {
  if (!vehicle.ownerPersonId) return null
  return [vehicle.ownerLastName, vehicle.ownerFirstName, vehicle.ownerOtherNames].filter(Boolean).join(', ')
}
