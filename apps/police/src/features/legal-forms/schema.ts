import * as m from '@/paraglide/messages'
import * as z from 'zod'

// PF53 "Charge" — the fields here are only what nothing else in the
// system already owns (case reference, accused's identity are read live
// through the join, never duplicated). See the migration's own comment
// for the sourcing behind this structure.
export const chargeSheetSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  caseReference: z.string(),
  caseSummary: z.string(),
  accusedPersonId: z.string().nullable(),
  accusedFirstName: z.string().nullable(),
  accusedLastName: z.string().nullable(),
  accusedOtherNames: z.string().nullable(),
  offence: z.string(),
  statutorySection: z.string(),
  particulars: z.string(),
  chargedAt: z.number(),
  officerId: z.string().nullable(),
  officerName: z.string().nullable(),
  stationName: z.string().nullable(),
  createdAt: z.number(),
})

export type ChargeSheet = z.infer<typeof chargeSheetSchema>

export const createChargeSheetSchema = z.object({
  caseId: z.string().min(1, { error: () => m["validation.case_is_required"]() }),
  accusedPersonId: z.string().nullable(),
  offence: z.string().min(1, { error: () => m["validation.the_offence_is_required"]() }),
  statutorySection: z.string().min(1, { error: () => m["validation.the_statutory_section_is_required"]() }),
  particulars: z.string().min(1, { error: () => m["validation.particulars_are_required"]() }),
  chargedAt: z.number(),
  officerId: z.string().nullable(),
  officerName: z.string(),
  stationName: z.string(),
})

export type CreateChargeSheetInput = z.infer<typeof createChargeSheetSchema>

export function chargeSheetAccusedName(cs: Pick<ChargeSheet, 'accusedFirstName' | 'accusedLastName' | 'accusedOtherNames'>) {
  if (!cs.accusedFirstName) return null
  return [cs.accusedLastName, cs.accusedFirstName, cs.accusedOtherNames].filter(Boolean).join(', ')
}
