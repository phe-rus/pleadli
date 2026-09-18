import { api } from '@/lib/api'
import {
  instrumentSchema,
  prisonerFileSchema,
  recordInstrumentSchema,
  sentenceSchema,
  setSentenceSchema,
  type RecordInstrumentInput,
  type SetSentenceInput,
} from './schema'

export async function getPrisonerFile(prisonerId: string) {
  return prisonerFileSchema.parse(await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/file`))
}

export async function recordInstrument(input: RecordInstrumentInput) {
  const parsed = recordInstrumentSchema.parse(input)
  const body = {
    ...parsed,
    issuingAuthority: parsed.issuingAuthority || null,
    reference: parsed.reference || null,
    verificationNote: parsed.verificationNote || null,
  }
  return instrumentSchema.parse(await api('POST', '/api/prisons/instruments', { body }))
}

export async function expectInstrument(prisonerId: string, kind: string) {
  return instrumentSchema.parse(await api('POST', '/api/prisons/instruments/expect', { body: { prisonerId, kind } }))
}

export async function supersedeInstrument(instrumentId: string, reason: string) {
  return instrumentSchema.parse(
    await api('POST', `/api/prisons/instruments/${encodeURIComponent(instrumentId)}/supersede`, { body: { reason } }),
  )
}

export async function setSentence(input: SetSentenceInput) {
  const parsed = setSentenceSchema.parse(input)
  const body = { ...parsed, reason: parsed.reason || null }
  return sentenceSchema.parse(await api('POST', '/api/prisons/sentences', { body }))
}
