import * as m from '@/paraglide/messages'
// Imported from each domain's own schema module directly, not its feature
// barrel — several of those barrels re-export a form component that itself
// imports from '@/features/people', which would make this a circular import.
import { attachmentSchema } from '@/features/attachments/schema'
import { bondSchema } from '@/features/bonds/schema'
import { caseSchema } from '@/features/cases/schema'
import { custodyRecordSchema } from '@/features/custody/schema'
import { exhibitSchema } from '@/features/evidence/schema'
import { incidentSchema } from '@/features/incidents/schema'
import { chargeSheetSchema } from '@/features/legal-forms/schema'
import { statementSchema } from '@/features/statements/schema'
import { stationDiaryEntrySchema } from '@/features/station-diary/schema'
import { vehicleSchema } from '@/features/vehicles/schema'
import * as z from 'zod'

export const personSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.number(),
  headshotAttachmentId: z.string().nullable(),
})

export type Person = z.infer<typeof personSchema>

export const createPersonSchema = z.object({
  firstName: z.string().min(1, { error: () => m["validation.first_name_is_required"]() }),
  lastName: z.string().min(1, { error: () => m["validation.last_name_is_required"]() }),
  otherNames: z.string(),
  phone: z.string(),
  nationalId: z.string(),
  address: z.string(),
})

export type CreatePersonInput = z.infer<typeof createPersonSchema>

// The continuity view: everything the system already knows about this
// person, composed from each domain's own real data — nothing here is a
// new field, just an assembly of what other features already schema'd.
export const personProfileSchema = z.object({
  person: personSchema,
  cases: z.array(caseSchema),
  incidents: z.array(incidentSchema),
  statements: z.array(statementSchema),
  custodyRecords: z.array(custodyRecordSchema),
  bonds: z.array(bondSchema),
  stationDiaryEntries: z.array(stationDiaryEntrySchema),
  exhibits: z.array(exhibitSchema),
  chargeSheets: z.array(chargeSheetSchema),
  vehicles: z.array(vehicleSchema),
  attachments: z.array(attachmentSchema),
})

export type PersonProfile = z.infer<typeof personProfileSchema>
