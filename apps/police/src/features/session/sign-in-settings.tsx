import * as m from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { format } from '@/lib/date'
import { useState } from 'react'
import { useAuthEvents, useAuthPolicy, useInstallation, useMe, useSaveAuthPolicy } from './queries'
import { authEventLabel } from './schema'

// Functions, not tables, so the labels are read in the current language.
const modes = () => [
  { value: 'badge_only', label: m["sign_in_settings.badge_only"]() },
  { value: 'password', label: m["sign_in_settings.badge_password"]() },
]

const timeouts = () => [
  { value: '30', label: m["sign_in_settings.t30"]() },
  { value: '60', label: m["sign_in_settings.t60"]() },
  { value: '240', label: m["sign_in_settings.t240"]() },
  { value: '480', label: m["sign_in_settings.t480"]() },
  { value: '720', label: m["sign_in_settings.t720"]() },
]

/** How officers sign in here. A Station starts on badge only; an administrator
 * can require passwords. A Command has no choice: it is always badge and
 * password. Only an administrator changes it, and the change is on the trail. */
export function SignInSettings() {
  const { data: installation } = useInstallation()
  const { data: me } = useMe()
  const { data: policy } = useAuthPolicy()
  const save = useSaveAuthPolicy()
  const admin = me?.role === 'admin'
  const command = installation?.mode === 'command'
  const [mode, setMode] = useState<string | null>(null)
  const [timeout, setTimeoutValue] = useState<string | null>(null)

  if (!policy) return null
  const shownMode = command ? 'password' : (mode ?? policy.mode)
  const shownTimeout = timeout ?? String(policy.idleTimeoutMinutes)
  const changed = shownMode !== policy.mode || shownTimeout !== String(policy.idleTimeoutMinutes)

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={m["sign_in_settings.title"]()}
        badge={<Tag tone={command ? 'open' : 'neutral'}>{command ? m["sign_in_settings.command_always"]() : m["sign_in_settings.station"]()}</Tag>}
        description={
          command
            ? m["sign_in_settings.command_desc"]()
            : m["sign_in_settings.station_desc"]()
        }
        hint={admin ? (changed ? m["sign_in_settings.next_sign_in"]() : undefined) : m["command_link.admin_only"]()}
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await save.mutateAsync({ mode: shownMode as 'badge_only' | 'password', idleTimeoutMinutes: Number(shownTimeout) })
            setMode(null)
            setTimeoutValue(null)
            t.success(m["sign_in_settings.saved"]())
          } catch (error) {
            t.error(m["common.save_failed"](), { description: error instanceof ApiError ? error.message : m["common.try_again"]() })
          }
        }}
        action={
          admin && !command ? (
            <Button type="submit" size="sm" disabled={!changed || save.isPending}>
              {m["common.save"]()}
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span>{m["sign_in_settings.sign_in_with"]()}</span>
            <Select items={modes()} value={shownMode} disabled={!admin || command} onValueChange={(v) => setMode(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes().map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span>{m["sign_in_settings.sign_out_after"]()}</span>
            <Select items={timeouts()} value={shownTimeout} disabled={!admin || command} onValueChange={(v) => setTimeoutValue(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeouts().map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {shownMode === 'password' && !command && <p className="text-muted-foreground">{m["sign_in_settings.password_note"]()}</p>}
      </SettingsCard>

      {admin && <SignInTrail />}
    </div>
  )
}

function SignInTrail() {
  const { data: events } = useAuthEvents()
  return (
    <SettingsCard title={m["sign_in_settings.trail"]()} description={m["sign_in_settings.trail_desc"]()}>
      {!events || events.length === 0 ? (
        <p className="text-muted-foreground">{m["sign_in_settings.nothing"]()}</p>
      ) : (
        <div role="list" className="flex max-h-80 flex-col divide-y divide-border/60 overflow-y-auto">
          {events.slice(0, 100).map((event) => (
            <div key={event.id} role="listitem" className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span>
                <strong>{authEventLabel(event.action)}</strong>
                {event.name ? `, ${event.name}` : event.badge ? m["sign_in_settings.badge_suffix"]({ badge: event.badge }) : ''}
                {event.detail ? `. ${event.detail}` : ''}
              </span>
              <span className="text-muted-foreground tabular-nums">{format(event.occurredAt, 'PP p')}</span>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}
