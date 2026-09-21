import * as z from 'zod'

export const contactSchema = z.enum(['current', 'stale', 'silent', 'never', 'not_applicable'])
export type Contact = z.infer<typeof contactSchema>

export const returnStateSchema = z.enum(['received', 'awaited', 'overdue', 'not_due'])
export type ReturnState = z.infer<typeof returnStateSchema>

export const attentionKindSchema = z.enum(['silent', 'never_contacted', 'pending_verification', 'return_overdue', 'over_capacity'])
export type AttentionKind = z.infer<typeof attentionKindSchema>

export const estateFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  facilityNumber: z.string(),
  location: z.string(),
  region: z.string(),
  status: z.string(),
  contact: contactSchema,
  lastContactAt: z.number().nullable(),
  /** As the facility last reported, at `populationAsAt`. `null` is unknown, never zero. */
  held: z.number().nullable(),
  unconvicted: z.number().nullable(),
  capacity: z.number().nullable(),
  occupancyPercent: z.number().nullable(),
  populationAsAt: z.number().nullable(),
  latestReturn: z
    .object({ id: z.string(), reference: z.string(), periodFrom: z.number(), periodTo: z.number(), receivedAt: z.number() })
    .nullable(),
  returnState: returnStateSchema,
})
export type EstateFacility = z.infer<typeof estateFacilitySchema>

export const estateRegionSchema = z.object({
  region: z.string(),
  facilities: z.array(estateFacilitySchema),
  inContact: z.number(),
  counted: z.number(),
  /** How many facilities in the region reported both people held and capacity. */
  reporting: z.number(),
  held: z.number().nullable(),
  capacity: z.number().nullable(),
  occupancyPercent: z.number().nullable(),
})
export type EstateRegion = z.infer<typeof estateRegionSchema>

export const attentionSchema = z.object({
  kind: attentionKindSchema,
  facilityId: z.string(),
  facilityName: z.string(),
  since: z.number().nullable(),
  figure: z.number().nullable(),
})
export type Attention = z.infer<typeof attentionSchema>

export const networkEventKindSchema = z.enum(['return_received', 'connection_requested', 'connection_approved', 'connection_rejected'])
export type NetworkEventKind = z.infer<typeof networkEventKindSchema>

/** Something that reached Head Office or was decided here, from the records
 * themselves. Nothing is inferred, so a quiet network has no events. */
export const networkEventSchema = z.object({
  at: z.number(),
  kind: networkEventKindSchema,
  facilityId: z.string(),
  facilityName: z.string(),
  /** The return's reference, or the person who asked or decided. */
  detail: z.string().nullable(),
})
export type NetworkEvent = z.infer<typeof networkEventSchema>

export const estateSchema = z.object({
  asOf: z.number(),
  returnPeriodFrom: z.number(),
  returnPeriodTo: z.number(),
  regions: z.array(estateRegionSchema),
  attention: z.array(attentionSchema),
  connectionRequestsWaiting: z.number(),
  /** Facilities whose connection was revoked. They are left out of `regions`. */
  revoked: z.number(),
  events: z.array(networkEventSchema),
})
export type Estate = z.infer<typeof estateSchema>
