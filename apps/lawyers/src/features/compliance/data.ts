import { api, seg } from '@/lib/api'
import { queryOptions, useMutation } from '@tanstack/react-query'
import * as z from 'zod'

export const certificateStates = ['missing', 'valid', 'soon', 'expired'] as const
export type CertificateState = (typeof certificateStates)[number]

const advocateSchema = z.object({
  staffId: z.string(),
  name: z.string(),
  practisingNumber: z.string().nullable(),
  certificateExpiresOn: z.number().nullable(),
  ulsPaidYear: z.number().nullable(),
  commissionerSince: z.number().nullable(),
  notarySince: z.number().nullable(),
  proBonoMinutes: z.number(),
  certificate: z.enum(certificateStates),
})
export type AdvocateCompliance = z.infer<typeof advocateSchema>

export const complianceSchema = z.object({ year: z.number(), targetMinutes: z.number(), advocates: z.array(advocateSchema), otherProBonoMinutes: z.number() })
export type Compliance = z.infer<typeof complianceSchema>

export type ComplianceInput = {
  practisingNumber: string | null
  certificateExpiresOn: number | null
  ulsPaidYear: number | null
  commissionerSince: number | null
  notarySince: number | null
}

export const complianceOptions = (year?: number) =>
  queryOptions({ queryKey: ['compliance', year ?? 'now'] as const, queryFn: async () => complianceSchema.parse(await api('GET', '/api/compliance', { query: year ? { year: String(year) } : {} })) })

export const useSaveCompliance = () =>
  useMutation({ mutationFn: async (v: { staffId: string; input: ComplianceInput }) => complianceSchema.parse(await api('PUT', `/api/compliance/${seg(v.staffId)}`, { body: v.input })) })

/** "12 h 30 min", "40 h". */
export function hours(minutes: number) {
  const h = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}
