import { SettingsCard } from '@/components/settings-card'
import { useSecurityStatus } from '@/features/security'
import { ApiError, api } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import * as z from 'zod'
import { setGrant } from './data'
import { grantsOptions } from './queries'
import { CAPABILITY_KEYS, ROLE_KEYS, type CapabilityKey, type RoleKey } from './schema'

const capabilityText: Record<CapabilityKey, { label: () => string; hint: () => string }> = {
  register_files: { label: m['caps.register_files'], hint: m['caps.register_files_hint'] },
  allocate_files: { label: m['caps.allocate_files'], hint: m['caps.allocate_files_hint'] },
  reassign_files: { label: m['caps.reassign_files'], hint: m['caps.reassign_files_hint'] },
  self_assign: { label: m['caps.self_assign'], hint: m['caps.self_assign_hint'] },
  review_files: { label: m['caps.review_files'], hint: m['caps.review_files_hint'] },
}
const roleText: Record<RoleKey, () => string> = { administrator: m['caps.role_administrator'], prosecutor: m['caps.role_prosecutor'], clerk: m['caps.role_clerk'] }

const say = (error: unknown) => (error instanceof ApiError ? error.message : m['common.try_again']())

const noticeOptions = { queryKey: ['time-limits'] as const, queryFn: async () => z.array(z.object({ key: z.string(), days: z.number() })).parse(await api('GET', '/api/time-limits')) }

/** The days before a hearing that it begins to need the prosecutor. */
function HearingNotice({ canChange }: { canChange: boolean }) {
  const queryClient = useQueryClient()
  const { data } = useQuery(noticeOptions)
  const saved = data?.find((l) => l.key === 'hearing_notice')?.days ?? 2
  const [days, setDays] = useState(String(saved))
  useEffect(() => setDays(String(saved)), [saved])
  const save = useMutation({
    mutationFn: (value: number) => api('PUT', '/api/time-limits/hearing_notice', { body: { days: value } }),
    onSuccess: () => void Promise.all([queryClient.invalidateQueries({ queryKey: ['time-limits'] }), queryClient.invalidateQueries({ queryKey: ['workload'] })]).then(() => t.success(m['caps.saved']())),
    onError: (e) => t.error(m['caps.failed'](), { description: say(e) }),
  })
  return (
    <SettingsCard title={m['caps.hearing_notice']()} description={m['caps.hearing_notice_hint']()}>
      <div className="flex items-center gap-3 py-3">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          className="w-24"
          value={days}
          disabled={!canChange}
          aria-label={m['caps.hearing_notice']()}
          onChange={(e) => setDays(e.target.value)}
          onBlur={() => {
            const n = Number(days)
            if (Number.isInteger(n) && n >= 1 && n <= 365 && n !== saved) save.mutate(n)
            else setDays(String(saved))
          }}
        />
      </div>
    </SettingsCard>
  )
}

/** Who may register, give out, move and take files, and who may review and decide.
 * Kept apart from administering the application: an administrator is one role among
 * three here, with no power over files unless the office gives it. */
export function AccessPane() {
  const queryClient = useQueryClient()
  const { data: status } = useSecurityStatus()
  const canChange = status?.actor?.role === 'administrator'
  const solo = status?.level === 'none'
  const { data: grants, isError, isPending, refetch } = useQuery(grantsOptions())
  const has = (role: RoleKey, capability: CapabilityKey) => grants?.find((g) => g.role === role && g.capability === capability)?.granted ?? false
  const change = useMutation({
    mutationFn: (v: { role: RoleKey; capability: CapabilityKey; granted: boolean }) => setGrant(v.role, v.capability, v.granted),
    onSuccess: () => void Promise.all([queryClient.invalidateQueries({ queryKey: ['capabilities'] }), queryClient.invalidateQueries({ queryKey: ['workload'] })]),
    onError: (e) => t.error(m['caps.failed'](), { description: say(e) }),
  })
  return (
    <>
      <SettingsCard title={m['caps.title']()} description={m['caps.intro']()} hint={!canChange ? m['caps.only_admin']() : solo ? m['caps.solo']() : m['caps.unconfirmed']()}>
        {isPending ? <p className="py-6 text-sm text-muted-foreground" role="status">{m['caps.loading']()}</p> : isError ? (
          <p className="flex items-center gap-3 py-6 text-sm text-destructive" role="alert">
            {m['caps.load_failed']()}
            <Button size="sm" variant="outline" onClick={() => void refetch()}>{m['common.try_again']()}</Button>
          </p>
        ) : (
        <div role="table" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          <div role="row" className="grid grid-cols-[1fr_repeat(3,minmax(5.5rem,7.5rem))] items-end gap-2 py-2 text-xs font-medium text-muted-foreground">
            <span role="columnheader" />
            {ROLE_KEYS.map((r) => (
              <span key={r} role="columnheader" className="text-balance break-words text-center">{roleText[r]()}</span>
            ))}
          </div>
          {CAPABILITY_KEYS.map((c) => (
            <div key={c} role="row" className="grid grid-cols-[1fr_repeat(3,minmax(5.5rem,7.5rem))] items-center gap-2 py-3">
              <div role="rowheader" className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{capabilityText[c].label()}</span>
                <span className="text-xs text-muted-foreground">{capabilityText[c].hint()}</span>
              </div>
              {ROLE_KEYS.map((r) => (
                <span key={r} role="cell" className="flex justify-center">
                  <Checkbox
                    checked={has(r, c)}
                    disabled={!canChange || change.isPending}
                    aria-label={`${capabilityText[c].label()}: ${roleText[r]()}`}
                    onCheckedChange={(checked) => change.mutate({ role: r, capability: c, granted: checked === true })}
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
        )}
        <p className="py-3 text-xs text-muted-foreground">{m['caps.role_director_note']()}</p>
      </SettingsCard>
      <HearingNotice canChange={canChange} />
    </>
  )
}
