import { api } from '@/lib/api'
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import * as z from 'zod'

export const criminalRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  ourRef: z.string().nullable(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  courtLevel: z.string().nullable(),
  offence: z.string().nullable(),
  stage: z.string(),
  status: z.string(),
  engagement: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  custody: z.string().nullable(),
  custodyPlace: z.string().nullable(),
  remandedOn: z.number().nullable(),
  committedOn: z.number().nullable(),
  adjournments: z.number(),
  nextHearingAt: z.number().nullable(),
  createdAt: z.number(),
})
export type CriminalRow = z.infer<typeof criminalRowSchema>

export const criminalRegisterOptions = () =>
  queryOptions({ queryKey: ['criminal-register'] as const, queryFn: async () => z.array(criminalRowSchema).parse(await api('GET', '/api/criminal-register')) })
export const useCriminalRegister = () => useSuspenseQuery(criminalRegisterOptions())

export function useSetCustodyDates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; remandedOn: number | null; committedOn: number | null }) => api('PUT', `/api/matters/${encodeURIComponent(v.id)}/custody-dates`, { body: { remandedOn: v.remandedOn, committedOn: v.committedOn } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['criminal-register'] }),
  })
}

const DAY = 86_400_000

/**
 * The Art. 23(6) clock of the Constitution of Uganda: 60 days on remand
 * before committal where a subordinate court can also try the offence, 180
 * where only the High Court can. Which applies is read from the court level
 * recorded on the matter. After committal the clock stops; the days on remand
 * are still shown, as they count toward a sentence (Art. 23(8)).
 */
export function remandClock(row: Pick<CriminalRow, 'custody' | 'remandedOn' | 'committedOn' | 'courtLevel'>, now = Date.now()) {
  const limit = row.courtLevel === 'high' ? 180 : 60
  if (!row.remandedOn) return { state: row.custody === 'remanded' ? ('unknown' as const) : ('none' as const), days: 0, limit }
  const until = row.committedOn ?? (row.custody === 'remanded' ? now : row.remandedOn)
  const days = Math.max(0, Math.floor((until - row.remandedOn) / DAY))
  if (row.committedOn) return { state: 'committed' as const, days, limit }
  if (row.custody !== 'remanded') return { state: 'none' as const, days, limit }
  return { state: days > limit ? ('over' as const) : days >= limit * 0.8 ? ('near' as const) : ('running' as const), days, limit }
}
