import * as z from 'zod'
import { obligationSchema } from '@/features/obligations/schema'
import { prisonerSchema } from '@/features/prisoners/schema'
import { transferSchema } from '@/features/transfers/schema'

export const stayEntryKinds = { reception: 'Reception', transfer_in: 'Transfer in', re_arrest: 'Re-arrest' } as const
export const stayExitKinds = { discharge: 'Discharge', transfer_out: 'Transfer out' } as const

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
  verified: 'Verified',
  pending: 'Awaited',
  rectification_pending: 'Awaiting rectification',
  superseded: 'Superseded',
}

export const instrumentKinds = [
  { value: 'commitment', label: 'Commitment' },
  { value: 'remand_warrant', label: 'Remand warrant' },
  { value: 'order_of_detention', label: 'Order of detention' },
  { value: 'warrant_of_conviction', label: 'Warrant of conviction / committal' },
  { value: 'charge_sheet', label: 'Charge sheet' },
  { value: 'committed_warrant', label: 'Committed warrant' },
  { value: 'court_order', label: 'Court order' },
  { value: 'other', label: 'Other' },
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
  if (sentence.isLife) return 'Life'
  const part = (n: number, unit: string) => (n > 0 ? `${n} ${unit}${n === 1 ? '' : 's'}` : null)
  return [part(sentence.termYears, 'year'), part(sentence.termMonths, 'month'), part(sentence.termDays, 'day')].filter(Boolean).join(', ')
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
  kind: z.string().min(1, 'Choose the instrument type.'),
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
