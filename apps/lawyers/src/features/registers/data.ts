import { api, seg } from '@/lib/api'
import { queryOptions, useMutation } from '@tanstack/react-query'
import * as z from 'zod'

export const registerIds = ['oaths', 'notarial'] as const
export type RegisterId = (typeof registerIds)[number]

/** What each register records, as the backend accepts it. */
export const registerKinds: Record<RegisterId, readonly string[]> = {
  oaths: ['affidavit', 'statutory_declaration', 'affirmation', 'other'],
  notarial: ['attestation', 'acknowledgment', 'certified_copy', 'protest', 'statutory_declaration', 'other'],
}

export const registerEntrySchema = z.object({
  id: z.string(),
  register: z.enum(registerIds),
  number: z.string(),
  kind: z.string(),
  onDay: z.number(),
  place: z.string().nullable(),
  personName: z.string(),
  personIdDocument: z.string().nullable(),
  personAddress: z.string().nullable(),
  documentTitle: z.string(),
  pages: z.number().nullable(),
  interpreter: z.string().nullable(),
  fee: z.number().nullable(),
  matterId: z.string().nullable(),
  matterTitle: z.string().nullable(),
  notes: z.string().nullable(),
  commissionerId: z.string(),
  commissionerName: z.string(),
  voidedAt: z.number().nullable(),
  voidedReason: z.string().nullable(),
  createdAt: z.number(),
})
export type RegisterEntry = z.infer<typeof registerEntrySchema>

const pageSchema = z.object({ entries: z.array(registerEntrySchema), refusal: z.string().nullable() })

export type RegisterInput = {
  register: RegisterId
  kind: string
  onDay: number
  place: string | null
  personName: string
  personIdDocument: string | null
  personAddress: string | null
  documentTitle: string
  pages: number | null
  interpreter: string | null
  fee: number | null
  matterId: string | null
  notes: string | null
}

export const registerOptions = (register: RegisterId, year: number) =>
  queryOptions({ queryKey: ['registers', register, year] as const, queryFn: async () => pageSchema.parse(await api('GET', '/api/registers', { query: { register, year: String(year) } })) })

export const useAddRegisterEntry = () => useMutation({ mutationFn: async (input: RegisterInput) => registerEntrySchema.parse(await api('POST', '/api/registers', { body: input })) })
export const useVoidRegisterEntry = () =>
  useMutation({ mutationFn: async (v: { id: string; reason: string }) => registerEntrySchema.parse(await api('POST', `/api/registers/${seg(v.id)}/void`, { body: { reason: v.reason } })) })

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** "this 30th day of September 2026", as a jurat writes the day. */
export function jurisDay(at: number) {
  const d = new Date(at)
  return `this ${ordinal(d.getDate())} day of ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`
}

/** The wording to put under the document: a jurat for an oath, a notarial
 * certificate for a notarial act. English, as the document it goes on. A
 * draft to check against the document, never a substitute for reading it. */
export function certificateText(e: RegisterEntry, place: string): string {
  const where = e.place ?? place
  const person = e.personName.toUpperCase()
  const interpreted = e.interpreter
    ? `\nthe contents having first been read over and interpreted to the deponent in a language they understand by ${e.interpreter}, who swore to interpret truly`
    : ''
  if (e.register === 'oaths') {
    const verb = e.kind === 'affirmation' ? 'AFFIRMED' : e.kind === 'statutory_declaration' ? 'DECLARED' : 'SWORN'
    return [
      `${verb} at ${where}`,
      `by the said ${person}`,
      `${jurisDay(e.onDay)}${interpreted}`,
      '',
      'BEFORE ME',
      '',
      '..............................................',
      `${e.commissionerName.toUpperCase()}`,
      'COMMISSIONER FOR OATHS',
      `Register No. ${e.number}`,
    ].join('\n')
  }
  const act =
    {
      attestation: `signed the ${e.documentTitle} in my presence`,
      acknowledgment: `acknowledged the ${e.documentTitle} to be their act and deed`,
      certified_copy: `produced the original of the ${e.documentTitle}, of which the annexed is a true copy compared by me`,
      protest: `requested that the ${e.documentTitle} be protested`,
      statutory_declaration: `made the declaration in the ${e.documentTitle} before me`,
    }[e.kind] ?? `appeared before me in respect of the ${e.documentTitle}`
  return [
    'NOTARIAL CERTIFICATE',
    '',
    `I, ${e.commissionerName.toUpperCase()}, Notary Public, duly admitted and practising in Uganda, certify that ${jurisDay(e.onDay).replace('this ', 'on the ')}`,
    `${person}${e.personIdDocument ? `, identified by ${e.personIdDocument},` : ''} ${act}${interpreted}.`,
    '',
    `IN WITNESS WHEREOF I have set my hand and seal of office at ${where} ${jurisDay(e.onDay)}.`,
    '',
    '..............................................',
    'NOTARY PUBLIC',
    `Register No. ${e.number}`,
  ].join('\n')
}
