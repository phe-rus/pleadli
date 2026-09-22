import * as z from 'zod'
import { adjournmentSchema, sittingSchema } from '../sittings/schema'
import { exhibitSchema } from '../exhibits/schema'
import { partySchema } from '../cases/schema'

export const appearanceRoles = [
  { id: 'accused', label: 'Accused' },
  { id: 'prosecutor', label: 'Prosecutor' },
  { id: 'defence_counsel', label: 'Defence counsel' },
  { id: 'complainant', label: 'Complainant' },
  { id: 'witness', label: 'Witness' },
  { id: 'interpreter', label: 'Interpreter' },
  { id: 'other', label: 'Other' },
] as const
export const appearanceRoleLabel = (id: string) => appearanceRoles.find((r) => r.id === id)?.label ?? id

export const attendanceOptions = [
  { id: 'unrecorded', label: 'Not recorded' },
  { id: 'present', label: 'Present' },
  { id: 'represented', label: 'Represented' },
  { id: 'absent', label: 'Absent' },
  { id: 'not_produced', label: 'Not produced from custody' },
] as const
export const attendanceLabel = (id: string) => attendanceOptions.find((a) => a.id === id)?.label ?? id

export const noteKinds = [
  { id: 'note', label: 'Note' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'submission', label: 'Submission' },
  { id: 'objection', label: 'Objection' },
  { id: 'ruling', label: 'Ruling' },
  { id: 'direction', label: 'Direction' },
] as const
export const noteKindLabel = (id: string) => noteKinds.find((k) => k.id === id)?.label ?? id

export const appearanceSchema = z.object({
  id: z.string(),
  sittingId: z.string(),
  partyId: z.string().nullable(),
  name: z.string(),
  role: z.string(),
  attendance: z.string(),
  note: z.string().nullable(),
  createdAt: z.number(),
})
export type Appearance = z.infer<typeof appearanceSchema>

export const benchNoteSchema = z.object({
  id: z.string(),
  sittingId: z.string(),
  at: z.number(),
  kind: z.string(),
  speaker: z.string().nullable(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type BenchNote = z.infer<typeof benchNoteSchema>

export const sittingDetailSchema = z.object({
  sitting: sittingSchema,
  case: z.object({ id: z.string(), courtNumber: z.string(), title: z.string(), courtLevel: z.string(), offence: z.string().nullable(), status: z.string() }),
  parties: z.array(partySchema),
  appearances: z.array(appearanceSchema),
  notes: z.array(benchNoteSchema),
  exhibits: z.array(exhibitSchema),
  adjournment: adjournmentSchema.nullable(),
  previous: z.array(
    z.object({
      id: z.string(),
      scheduledAt: z.number(),
      purpose: z.string(),
      status: z.string(),
      outcome: z.string().nullable(),
      reason: z.string().nullable(),
      responsible: z.string().nullable(),
    }),
  ),
  record: z.object({ signedAt: z.number().nullable(), signedBy: z.string().nullable(), sha256: z.string().nullable(), intact: z.boolean().nullable() }),
})
export type SittingDetail = z.infer<typeof sittingDetailSchema>

export type NoteInput = { kind: string; speaker: string | null; body: string; at?: number | null }
export type AttendanceInput = { attendance: string; note: string | null }

/** Where a person in custody is held and until when, in one line. */
export function custodyText(party: { role: string; custody: string | null; remandUntil: number | null; custodyPlace: string | null }): string | null {
  if (party.role !== 'accused') return null
  if (!party.custody) return 'Custody not recorded'
  if (party.custody === 'on_bail') return 'On bail'
  if (party.custody === 'not_in_custody') return 'Not in custody'
  const where = party.custodyPlace ? ` at ${party.custodyPlace}` : ''
  return party.remandUntil ? `Remanded${where} until ${new Date(party.remandUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : `Remanded${where}, no end date recorded`
}
