import { SettingsCard } from '@/components/settings-card'
import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useCreateEnrolmentCode, useDevices, useEnvironment, useRevokeDevice, useSetNodeMode } from './queries'
import { m } from '@/paraglide/messages'

/**
 * This machine as the facility's node (docs/prisons/product-map/04 I.3). The
 * node is the one place facility records live; workstations on the LAN use it
 * over TLS. To add a workstation: make an enrolment code here, then on the
 * workstation choose "This is another computer in a facility that already has
 * one" and enter this machine's address, the fingerprint below, and the code.
 */
export function NodePanel() {
  const { data: environment } = useEnvironment()
  const { data: devices } = useDevices()
  const setMode = useSetNodeMode()
  const createCode = useCreateEnrolmentCode()
  const revoke = useRevokeDevice()
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<{ code: string; label: string; expiresAt: number } | null>(null)

  if (!environment) return null
  const { network } = environment
  const serving = network.mode === 'node'

  const serveRows: SettingsRow[] = [
    {
      key: 'serve',
      label: m.node_serve_workstations_on_the_facility_netwo(),
      description: m.node_other_computers_in_this_facility_can(),
      control: (
        <Switch
          checked={serving}
          disabled={setMode.isPending}
          onCheckedChange={(serve) =>
            setMode.mutate(
              { serve, port: network.lanPort },
              { onError: (error) => t.error(m.node_could_not_change_that(), { description: error instanceof ApiError ? error.message : undefined }) },
            )
          }
        />
      ),
    },
  ]

  const listenerRows: SettingsRow[] = [
    {
      key: 'listener',
      label: m.node_listener(),
      control: network.listening ? <Badge>{m.node_accepting_connections()}</Badge> : <Badge variant="destructive">{m.node_not_listening_yet()}</Badge>,
    },
    {
      key: 'address',
      label: m.node_address_for_workstations(),
      control: null,
      expanded: <code>{network.addresses.length > 0 ? network.addresses.join('   ') : m.node_this_computer_s_address_port({ lanPort: network.lanPort })}</code>,
    },
    {
      key: 'fingerprint',
      label: m.node_fingerprint(),
      description: m.node_a_workstation_must_be_given_this(),
      control: null,
      expanded: <code className="break-all">{network.fingerprint ?? m.node_not_generated_yet()}</code>,
    },
  ]

  const deviceRows: SettingsRow[] = (devices ?? []).map((device) => ({
    key: device.id,
    label: device.label,
    description: `${m.node_enrolled({ enrolledAt: format(device.enrolledAt, 'PPp') })}${device.lastSeenAt ? m.node_last_seen({ lastSeenAt: format(device.lastSeenAt, 'PPp') }) : ''}`,
    control: device.revokedAt ? (
      <Badge variant="secondary">{m.node_revoked()}</Badge>
    ) : (
      <Button size="xs" variant="secondary" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(device.id)}>
        {m.node_revoke()}
      </Button>
    ),
  }))

  return (
    <div className="flex flex-col gap-6">
      <SettingsTable rows={serveRows} />
      {serving && <SettingsTable rows={listenerRows} />}

      {serving && (
        <SettingsCard
          title={m.node_workstations()}
          description={m.node_name_the_computer_make_a_one()}
          onSubmit={async (event) => {
            event.preventDefault()
            if (!label.trim()) return
            try {
              const code = await createCode.mutateAsync(label.trim())
              setIssued({ ...code, label: label.trim() })
              setLabel('')
            } catch (error) {
              t.error(m.node_could_not_make_a_code(), { description: error instanceof ApiError ? error.message : undefined })
            }
          }}
          hint={issued ? m.node_for_works_once_until({ label: issued.label, expiresAt: format(issued.expiresAt, 'p') }) : undefined}
          action={
            <Button type="submit" size="sm" disabled={!label.trim() || createCode.isPending}>
              {m.node_make_enrolment_code()}
            </Button>
          }
        >
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={m.node_name_this_workstation_e_g_registry()} aria-label={m.node_workstation_name()} />
          {issued && (
            <h3>
              <code>{issued.code}</code>
            </h3>
          )}
        </SettingsCard>
      )}

      {serving && (deviceRows.length === 0 ? <p>{m.node_no_workstations_enrolled_yet()}</p> : <SettingsTable rows={deviceRows} />)}
    </div>
  )
}
