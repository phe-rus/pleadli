import { m } from '@/paraglide/messages'
import { api, ApiError } from '@/lib/api'
import { t } from '@pleadli/ui/goey-toaster'
import { installZone } from '@pleadli/ui/lib/institution-zone'
import { TimezonePanel, type TimezoneLabels } from '@pleadli/ui/timezone-panel'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as z from 'zod'

const statusSchema = z.object({
  country: z.string(),
  zoneId: z.string().nullable(),
  choices: z.array(z.string()),
  history: z.array(z.object({ effectiveFromMs: z.number(), zoneId: z.string() })),
  nowShown: z.string(),
  clockWarnings: z.array(z.object({ kind: z.enum(['beforeRelease', 'behindRecords', 'farAhead']) })),
})

export const zoneKey = ['institution-timezone'] as const

const load = async () => statusSchema.parse(await api('GET', '/api/prisons/timezone'))

/** Makes every time drawn on screen use this office's zone. Runs while the page renders, so what renders after it already reads the right zone.
 * Returns a value that changes when the zone does, to key the page by. */
export function useInstalledZone(enabled: boolean) {
  const { data } = useQuery({ queryKey: zoneKey, queryFn: load, enabled, refetchInterval: 60_000, retry: false })
  if (data) installZone(data)
  return data ? `${data.zoneId}|${data.history.length}` : 'none'
}

const labels = (): TimezoneLabels => ({
  title: m.timezone_title(),
  about: m.timezone_about(),
  label: m.timezone_label(),
  hint: m.timezone_hint(),
  notSet: m.timezone_not_set(),
  notSetHint: m.timezone_not_set_hint(),
  adminOnly: m.timezone_admin_only(),
  nowLabel: m.timezone_now_label(),
  clockTitle: m.timezone_clock_title(),
  clockOk: m.timezone_clock_ok(),
  clockBeforeRelease: m.timezone_clock_before_release(),
  clockBehind: m.timezone_clock_behind(),
  clockFarAhead: m.timezone_clock_far_ahead(),
})

/** The office's time zone and a warning when this computer's clock looks wrong. The server refuses a change from anyone who is not an administrator. */
export function TimezonePane({ canChange }: { canChange: boolean }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: zoneKey, queryFn: load, retry: false })
  const change = useMutation({
    mutationFn: async (zoneId: string) => statusSchema.parse(await api('PUT', '/api/prisons/timezone', { body: { zoneId } })),
    onSuccess: (next) => {
      queryClient.setQueryData(zoneKey, next)
      t.success(m.timezone_saved())
    },
    onError: (error) => t.error(m.timezone_failed(), { description: error instanceof ApiError ? error.message : undefined }),
  })
  if (!data) return null
  return <TimezonePanel status={data} canChange={canChange} busy={change.isPending} onChange={(zoneId) => change.mutate(zoneId)} labels={labels()} />
}
