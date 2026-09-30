import * as z from 'zod'
import { obligationSchema } from '@/features/obligations/schema'
import { prisonerSchema } from '@/features/prisoners/schema'
import { transferSchema } from '@/features/transfers/schema'
import { m } from '@/paraglide/messages'

export const stayEntryKinds = { get reception() { return m.custody_reception() }, get transfer_in() { return m.custody_transfer_in() }, get re_arrest() { return m.custody_re_arrest() } } as const
export const stayExitKinds = { get discharge() { return m.custody_discharge() }, get transfer_out() { return m.custody_transfer_out() } } as const

export const staySchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  episodeId: z.string(),
  entryKind: z.string(),
  enteredAt: z.number(),
  exitKind: z.string().nullable(),
  exitedAt: z.number().nullable(),
  exitRef: z.string().nullable(),
  createdAt: z.number(),
})

export type Stay = z.infer<typeof staySchema>

export const instrumentSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  kind: z.string(),
  issuingAuthority: z.string().nullable(),
  reference: z.string().nullable(),
  issuedOn: z.number().nullable(),
  receivedAt: z.number().nullable(),
  authenticated: z.boolean(),
  verificationNote: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  status: z.string(),
  supersededBy: z.string().nullable(),
  supersedeReason: z.string().nullable(),
  createdAt: z.number(),
})

export type Instrument = z.infer<typeof instrumentSchema>

export const instrumentStatusLabels: Record<string, string> = {
  get verified() { return m.custody_verified() },
  get pending() { return m.custody_awaited() },
  get rectification_pending() { return m.custody_awaiting_rectification() },
  get superseded() { return m.custody_superseded() },
}

export const instrumentKinds = [
  { value: 'commitment', get label() { return m.custody_commitment() } },
  { value: 'remand_warrant', get label() { return m.custody_remand_warrant() } },
  { value: 'order_of_detention', get label() { return m.custody_order_of_detention() } },
  { value: 'warrant_of_conviction', get label() { return m.custody_warrant_of_conviction_committal() } },
  { value: 'charge_sheet', get label() { return m.custody_charge_sheet() } },
  { value: 'committed_warrant', get label() { return m.custody_committed_warrant() } },
  { value: 'court_order', get label() { return m.custody_court_order() } },
  { value: 'other', get label() { return m.custody_other() } },
] as const

export function instrumentKindLabel(kind: string) {
  return instrumentKinds.find((k) => k.value === kind)?.label ?? kind.replace(/_/g, ' ')
}

export const sentenceSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  instrumentId: z.string().nullable(),
  termYears: z.number(),
  termMonths: z.number(),
  termDays: z.number(),
  isLife: z.boolean(),
  startsOn: z.number(),
  remissionForfeitedDays: z.number(),
  supersededAt: z.number().nullable(),
  createdAt: z.number(),
})

export type Sentence = z.infer<typeof sentenceSchema>

export function sentenceTermText(sentence: Pick<Sentence, 'isLife' | 'termYears' | 'termMonths' | 'termDays'>) {
  if (sentence.isLife) return m.custody_life()
  const part = (n: number, one: () => string, many: (p: { n: number }) => string) => (n > 0 ? (n === 1 ? one() : many({ n })) : null)
  return [
    part(sentence.termYears, m.custody_term_year_one, m.custody_term_years),
    part(sentence.termMonths, m.custody_term_month_one, m.custody_term_months),
    part(sentence.termDays, m.custody_term_day_one, m.custody_term_days),
  ]
    .filter(Boolean)
    .join(', ')
}

export const clocksSchema = z.object({
  daysHeld: z.number(),
  mandatoryBailOn: z.number().nullable(),
  sentenceEndsOn: z.number().nullable(),
  remissionDays: z.number().nullable(),
  releaseDueOn: z.number().nullable(),
  paroleWindowOpensOn: z.number().nullable(),
  isLife: z.boolean(),
  reviewable: z.boolean(),
})

export type Clocks = z.infer<typeof clocksSchema>

export const contactSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  name: z.string(),
  relationship: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  isEmergency: z.boolean(),
  notifyOnImprisonment: z.boolean(),
  createdAt: z.number(),
})

export type Contact = z.infer<typeof contactSchema>

export const prisonerFileSchema = z.object({
  prisoner: prisonerSchema,
  stays: z.array(staySchema),
  clocks: clocksSchema,
  sentence: sentenceSchema.nullable(),
  instruments: z.array(instrumentSchema),
  contacts: z.array(contactSchema),
  obligations: z.array(obligationSchema),
  nextCourtAt: z.number().nullable(),
  openTransfer: transferSchema.nullable(),
})

export type PrisonerFile = z.infer<typeof prisonerFileSchema>

export const recordInstrumentSchema = z.object({
  prisonerId: z.string().min(1),
  kind: z.string().min(1, { error: () => m.validation_instrument_type_required() }),
  issuingAuthority: z.string(),
  reference: z.string(),
  issuedOn: z.number().nullable(),
  receivedAt: z.number(),
  authenticated: z.boolean(),
  verificationNote: z.string(),
  resolvesInstrumentId: z.string().nullable(),
})

export type RecordInstrumentInput = z.infer<typeof recordInstrumentSchema>

export const setSentenceSchema = z.object({
  prisonerId: z.string().min(1),
  instrumentId: z.string().nullable(),
  termYears: z.number().int().min(0),
  termMonths: z.number().int().min(0),
  termDays: z.number().int().min(0),
  isLife: z.boolean(),
  startsOn: z.number(),
  remissionForfeitedDays: z.number().int().min(0),
  reason: z.string(),
})

export type SetSentenceInput = z.infer<typeof setSentenceSchema>
