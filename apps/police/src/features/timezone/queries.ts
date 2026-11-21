import { api } from '@/lib/api'
import { installZone } from '@pleadli/ui/lib/institution-zone'
import { useQuery } from '@tanstack/react-query'
import * as z from 'zod'

export const statusSchema = z.object({
  country: z.string(),
  zoneId: z.string().nullable(),
  choices: z.array(z.string()),
  history: z.array(z.object({ effectiveFromMs: z.number(), zoneId: z.string() })),
  nowShown: z.string(),
  clockWarnings: z.array(z.object({ kind: z.enum(['beforeRelease', 'behindRecords', 'farAhead']) })),
})

export const zoneKey = ['station-timezone'] as const

export const useZone = () =>
  useQuery({
    queryKey: zoneKey,
    queryFn: async () => statusSchema.parse(await api('/timezone')),
    // The clock line should stay honest while the screen is open.
    refetchInterval: 60_000,
  })

/** Makes every time drawn on screen use the station's zone. Runs while the page renders, so the children,
 * rendered after it, already read the right zone. Returns a version that changes when the zone does. */
export function useInstalledZone(enabled: boolean) {
  const { data } = useQuery({ ...{ queryKey: zoneKey, queryFn: async () => statusSchema.parse(await api('/timezone')) }, enabled, refetchInterval: 60_000 })
  if (data) installZone(data)
  return data ? `${data.zoneId}|${data.history.length}` : 'none'
}
