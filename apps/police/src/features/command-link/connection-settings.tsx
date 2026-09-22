import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useMe } from '@/features/session'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
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
        title="Command"
        badge={<Tag tone={tone}>{link.state === 'connected' ? 'Connected' : link.state === 'pending' ? 'Waiting for approval' : 'Not accepted'}</Tag>}
        description={`${link.stationName ?? link.stationNumber} at ${link.address}, as station ${link.stationNumber}.`}
        hint={admin ? undefined : 'Only an administrator can change this.'}
        action={
          admin ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disconnect.isPending}
              onClick={() => {
                if (window.confirm('Disconnect from the command? It will stop receiving this station\'s reports.')) void disconnect.mutateAsync()
              }}
            >
              Disconnect
            </Button>
          ) : undefined
        }
      >
        <p>
          {link.state === 'pending' && `Asked by ${link.requestedBy ?? 'an officer'}. An administrator at the command has to approve it. This page checks every 20 seconds.`}
          {link.state === 'connected' && (link.lastReportAt ? `Last report ${formatDistanceToNowStrict(link.lastReportAt, { addSuffix: true })} (${format(link.lastReportAt, 'PP p')}).` : 'Connected. The first report goes out within a minute.')}
          {link.state === 'rejected' && 'The command does not accept this station. Disconnect and connect again, or ask the command.'}
        </p>
        {link.lastError && <p className="text-destructive">{link.lastError}</p>}
        <p className="text-muted-foreground">This station sends its command counts (people in custody, near the limit, open cases, referrals without an outcome, officers on duty) and its roster of officers. It never sends a case, a person, a statement or a password.</p>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      title="Connect to a command"
      description="Connect this station to the command (HQ) it reports to. The command gives the station a number, and may give an activation code."
      hint={admin ? 'The connection is not encrypted yet; use it on a network the command controls.' : 'Only an administrator can connect the station.'}
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        try {
          await connect.mutateAsync({ address, stationNumber: number, activationCode: code })
          setCode('')
          t.success('Connection requested')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'It could not connect.')
        }
      }}
      action={
        admin ? (
          <Button type="submit" size="sm" disabled={connect.isPending || !address.trim() || !number.trim()}>
            Connect
          </Button>
        ) : undefined
      }
    >
      <Field>
        <FieldLabel>Address of the command</FieldLabel>
        <Input placeholder="e.g. 192.168.1.20:47822" disabled={!admin} value={address} onChange={(e) => setAddress(e.target.value)} />
        <FieldDescription>The address and port the command shows on its Settings.</FieldDescription>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>Station number</FieldLabel>
          <Input placeholder="e.g. ST-0001" disabled={!admin} value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Activation code (optional)</FieldLabel>
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
