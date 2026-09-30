import * as m from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useMe } from '@/features/session'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { format } from '@/lib/date'
import { formatDistanceToNowStrict } from '@/lib/date'
import { useState } from 'react'
import { useConnect, useDisconnect, useLink } from './queries'

/** The station's link to its command (HQ). Connect with the command's address
 * and the number it gave this station; an activation code connects at once,
 * otherwise an administrator at the command approves. Once connected, the
 * station reports figures and its roster, never a record. */
export function ConnectionSettings() {
  const { data: link } = useLink()
  const { data: me } = useMe()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const admin = me?.role === 'admin'
  const [address, setAddress] = useState('')
  const [number, setNumber] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (link === undefined) return null

  if (link) {
    const tone = link.state === 'connected' ? 'done' : link.state === 'pending' ? 'open' : 'urgent'
    return (
      <SettingsCard
        title={m["command_link.title"]()}
        badge={<Tag tone={tone}>{link.state === 'connected' ? m["common.connected"]() : link.state === 'pending' ? m["command_link.pending"]() : m["command_link.not_accepted"]()}</Tag>}
        description={m["command_link.description"]({ name: link.stationName ?? link.stationNumber, address: link.address, number: link.stationNumber })}
        hint={admin ? undefined : m["command_link.admin_only"]()}
        action={
          admin ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disconnect.isPending}
              onClick={() => {
                if (window.confirm(m["command_link.disconnect_confirm"]())) void disconnect.mutateAsync()
              }}
            >
              {m["common.disconnect"]()}
            </Button>
          ) : undefined
        }
      >
        <p>
          {link.state === 'pending' && m["command_link.asked_by"]({ name: link.requestedBy ?? m["command_link.an_officer"]() })}
          {link.state === 'connected' && (link.lastReportAt ? m["command_link.last_report"]({ when: formatDistanceToNowStrict(link.lastReportAt, { addSuffix: true }), date: format(link.lastReportAt, 'PP p') }) : m["command_link.connected_first"]())}
          {link.state === 'rejected' && m["command_link.rejected"]()}
        </p>
        {link.lastError && <p className="text-destructive">{link.lastError}</p>}
        <p className="text-muted-foreground">{m["command_link.what_is_sent"]()}</p>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      title={m["command_link.connect_title"]()}
      description={m["command_link.connect_description"]()}
      hint={admin ? m["command_link.not_encrypted"]() : m["command_link.admin_only_connect"]()}
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        try {
          await connect.mutateAsync({ address, stationNumber: number, activationCode: code })
          setCode('')
          t.success(m["command_link.requested"]())
        } catch (e) {
          setError(e instanceof Error ? e.message : m["command_link.could_not_connect"]())
        }
      }}
      action={
        admin ? (
          <Button type="submit" size="sm" disabled={connect.isPending || !address.trim() || !number.trim()}>
            {m["common.connect"]()}
          </Button>
        ) : undefined
      }
    >
      <Field>
        <FieldLabel>{m["command_link.address_label"]()}</FieldLabel>
        <Input placeholder={m["command_link.address_placeholder"]()} disabled={!admin} value={address} onChange={(e) => setAddress(e.target.value)} />
        <FieldDescription>{m["command_link.address_hint"]()}</FieldDescription>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>{m["common.station_number"]()}</FieldLabel>
          <Input placeholder={m["command_link.number_placeholder"]()} disabled={!admin} value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{m["command_link.activation_optional"]()}</FieldLabel>
          <Input disabled={!admin} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </SettingsCard>
  )
}
