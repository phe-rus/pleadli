import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useAuthEvents, useAuthPolicy, useInstallation, useMe, useSaveAuthPolicy } from './queries'
import { authEventLabel } from './schema'

const modes = [
  { value: 'badge_only', label: 'Badge only' },
  { value: 'password', label: 'Badge and password' },
]

const timeouts = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
  { value: '720', label: '12 hours' },
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
        title="Sign-in"
        badge={<Tag tone={command ? 'open' : 'neutral'}>{command ? 'Command: always on' : 'Station'}</Tag>}
        description={
          command
            ? 'A command always needs a badge number and a password. This cannot be changed.'
            : 'What an officer needs to sign in at this station. A badge number says who is at the keyboard; it is not a secret. Turn on passwords for a machine that others can reach.'
        }
        hint={admin ? (changed ? 'Changes apply to the next sign-in.' : undefined) : 'Only an administrator can change this.'}
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await save.mutateAsync({ mode: shownMode as 'badge_only' | 'password', idleTimeoutMinutes: Number(shownTimeout) })
            setMode(null)
            setTimeoutValue(null)
            t.success('Sign-in settings saved')
          } catch (error) {
            t.error('Could not save', { description: error instanceof ApiError ? error.message : 'Please try again.' })
          }
        }}
        action={
          admin && !command ? (
            <Button type="submit" size="sm" disabled={!changed || save.isPending}>
              Save
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span>Officers sign in with</span>
            <Select items={modes} value={shownMode} disabled={!admin || command} onValueChange={(v) => setMode(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span>Sign out after no activity for</span>
            <Select items={timeouts} value={shownTimeout} disabled={!admin || command} onValueChange={(v) => setTimeoutValue(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeouts.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {shownMode === 'password' && !command && <p className="text-muted-foreground">Every officer then needs a password, set on the Officers page. An officer with none cannot sign in until an administrator gives them one.</p>}
      </SettingsCard>

      {admin && <SignInTrail />}
    </div>
  )
}

function SignInTrail() {
  const { data: events } = useAuthEvents()
  return (
    <SettingsCard title="Sign-in trail" description="Every sign-in, refusal, sign-out and change to these settings, newest first.">
      {!events || events.length === 0 ? (
        <p className="text-muted-foreground">Nothing has been recorded yet.</p>
      ) : (
        <div role="list" className="flex max-h-80 flex-col divide-y divide-border/60 overflow-y-auto">
          {events.slice(0, 100).map((event) => (
            <div key={event.id} role="listitem" className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span>
                <strong>{authEventLabel(event.action)}</strong>
                {event.name ? `, ${event.name}` : event.badge ? `, badge ${event.badge}` : ''}
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
