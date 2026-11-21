import * as m from '@/paraglide/messages'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { useMe } from '@/features/session'
import { api, ApiError } from '@/lib/api'
import { t } from '@pleadli/ui/goey-toaster'
import { Segmented } from '@pleadli/ui/segmented'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { statusSchema, useZone, zoneKey } from './queries'


const clockText = (kind: string) =>
  kind === 'beforeRelease' ? m['timezone.clock_before_release']() : kind === 'behindRecords' ? m['timezone.clock_behind']() : m['timezone.clock_far_ahead']()

/** The station's own time zone for every legal time it prints, and a warning when this computer's clock looks wrong.
 * The two are shown together but are different things: a right zone does not fix a wrong clock. */
export function TimezoneCard() {
  const { data } = useZone()
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: async (zoneId: string) => statusSchema.parse(await api('/timezone', { method: 'PUT', body: JSON.stringify({ zoneId }) })),
    onSuccess: (next) => {
      queryClient.setQueryData(zoneKey, next)
      t.success(m['timezone.saved']())
    },
    onError: (error) => t.error(m['timezone.failed'](), { description: error instanceof ApiError ? error.message : m['common.try_again']() }),
  })
  if (!data) return null
  const admin = me?.role === 'admin'

  return (
    <>
      <SettingsCard title={m['timezone.title']()} description={m['timezone.about']()} hint={admin ? m['timezone.hint']() : m['timezone.admin_only']()}>
        <SettingsRow label={m['timezone.label']()} hint={data.zoneId ? undefined : m['timezone.not_set_hint']()}>
          {admin && data.choices.length > 1 ? (
            <Segmented
              label={m['timezone.label']()}
              value={(data.zoneId ?? '') as string}
              onChange={(zoneId) => change.mutate(zoneId)}
              items={data.choices.map((zone) => ({ value: zone, label: zone.split('/')[1] ?? zone }))}
            />
          ) : (
            <span className="text-muted-foreground">{data.zoneId ?? m['timezone.not_set']()}</span>
          )}
        </SettingsRow>
        <SettingsRow label={m['timezone.now_label']()}>
          <span className="text-muted-foreground tabular-nums">{data.nowShown}</span>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={m['timezone.clock_title']()}>
        {data.clockWarnings.length === 0 ? (
          <SettingsRow label={m['timezone.clock_ok']()}>{null}</SettingsRow>
        ) : (
          data.clockWarnings.map((w) => (
            <SettingsRow key={w.kind} label={<span role="alert" className="text-destructive">{clockText(w.kind)}</span>}>
              {null}
            </SettingsRow>
          ))
        )}
      </SettingsCard>
    </>
  )
}
