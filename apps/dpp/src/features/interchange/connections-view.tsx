import { SettingsCard } from '@/components/settings-card'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { createIdentity, createInvite, declineConnection, revokeConnection, saveFile, trustConnection } from './data'
import { ImportButton } from './import-button'
import { useConnections, useIdentity } from './queries'
import { connectionStates, type Connection } from './schema'

const say = (error: unknown) => (error instanceof ApiError ? error.message : typeof error === 'string' ? error : 'Please try again.')

function IdentityCard() {
  const { data: identity } = useIdentity()
  const [name, setName] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const create = useMutation({
    mutationFn: () => createIdentity(name, jurisdiction),
    onSuccess: () => t.success('This office now has an identity'),
    onError: (e) => t.error('Could not set it up', { description: say(e) }),
  })

  if (identity) {
    return (
      <SettingsCard
        title={identity.officeName}
        badge={<Tag tone="done">Identity set</Tag>}
        description={identity.jurisdiction ? `Handles: ${identity.jurisdiction}.` : 'This is who the stations that send here know this office as.'}
        hint="A station asks for this code when it confirms this office. Read it to them; do not send it in the same message as the invitation."
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Fingerprint of this office</span>
          <code className="w-fit rounded-md bg-muted px-3 py-2 text-lg font-semibold tracking-wider text-foreground">{identity.fingerprint}</code>
        </div>
      </SettingsCard>
    )
  }
  return (
    <SettingsCard
      title="Identify this office"
      description="Name the office as the stations that send to it know it. It gets a signing key and an encryption key that never leave this computer. The name cannot be changed afterwards, because every station confirms it."
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
      action={
        <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
          Create the identity
        </Button>
      }
    >
      <Input aria-label="Office name" placeholder="e.g. Wandegeya DPP Office" value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label="Area handled" placeholder="The area it handles (optional)" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
    </SettingsCard>
  )
}

function InviteCard({ disabled }: { disabled: boolean }) {
  const [station, setStation] = useState('')
  const [days, setDays] = useState(14)
  const invite = useMutation({
    mutationFn: async () => {
      const connection = await createInvite(station, days)
      await saveFile('invite', connection.id)
      return connection
    },
    onSuccess: () => {
      t.success('Invitation made')
      setStation('')
    },
    onError: (e) => t.error('Could not make the invitation', { description: say(e) }),
  })
  return (
    <SettingsCard
      title="Invite a station"
      description="A station can only send here if this office invites it. The invitation is for that station, is used once, and expires. Send the file to the station by any means: a stick, e-mail, a download."
      hint="Then import the answer the station sends back."
      onSubmit={(e) => {
        e.preventDefault()
        invite.mutate()
      }}
      action={
        <Button type="submit" size="sm" disabled={disabled || invite.isPending || !station.trim()}>
          Make the invitation
        </Button>
      }
    >
      <Input aria-label="Station" placeholder="The station, e.g. Wandegeya Police Station" value={station} onChange={(e) => setStation(e.target.value)} disabled={disabled} />
      <label className="flex items-center justify-between gap-3">
        <span>Open for</span>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      {disabled && <p>Identify this office first.</p>}
    </SettingsCard>
  )
}

function ConnectionRow({ connection: c }: { connection: Connection }) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const state = connectionStates[c.state] ?? { label: c.state, tone: 'stopped' as const }
  const trust = useMutation({ mutationFn: () => trustConnection(c.id, typed), onSuccess: () => t.success('Station trusted. Send it the confirmation.'), onError: (e) => t.error('Not trusted', { description: say(e) }) })
  const decline = useMutation({ mutationFn: () => declineConnection(c.id, reason), onError: (e) => t.error('Could not decline', { description: say(e) }) })
  const revoke = useMutation({ mutationFn: () => revokeConnection(c.id, reason), onSuccess: () => t.success('Connection ended'), onError: (e) => t.error('Could not end it', { description: say(e) }) })
  const resend = useMutation({ mutationFn: () => saveFile('invite', c.id), onError: (e) => t.error('Could not save the invitation', { description: say(e) }) })

  return (
    <div role="listitem" className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{c.stationName ?? c.intendedStation}</strong>
        <Tag tone={state.tone}>{state.label}</Tag>
        {c.state === 'trusted' && c.waiting > 0 && <Tag tone="open">{c.waiting} waiting</Tag>}
        <span className="ml-auto text-muted-foreground">Invited {format(c.createdAt, 'PP')}</span>
      </div>

      {c.state === 'invited' && (
        <div className="flex flex-wrap items-center gap-3">
          <p>Waiting for {c.intendedStation} to answer. Open until {format(c.inviteExpiresAt, 'PP')}.</p>
          <Button size="sm" variant="outline" onClick={() => resend.mutate()}>
            Save the invitation again
          </Button>
        </div>
      )}

      {c.state === 'awaiting_confirmation' && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p>
            <strong>{c.stationName}</strong> answered{c.stationJurisdiction ? ` (${c.stationJurisdiction})` : ''}
            {c.officerInCharge ? `, officer in charge ${c.officerInCharge}` : ''}. It is not trusted yet: anyone could have answered. Phone or meet the station and have them read their fingerprint out. Type what they read. It must match this one:
          </p>
          <code className="w-fit rounded-md bg-background px-3 py-2 text-lg font-semibold tracking-wider text-foreground">{c.fingerprint}</code>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Fingerprint the station read out" placeholder="Type what the station reads out" className="max-w-xs" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Button size="sm" disabled={trust.isPending || typed.replace(/[^0-9a-f]/gi, '').length < 20} onClick={() => trust.mutate()}>
              It matches: trust this station
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Reason for declining" placeholder="Not them? Say why (optional)" className="max-w-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={decline.isPending} onClick={() => decline.mutate()}>
              Decline
            </Button>
          </div>
        </div>
      )}

      {c.state === 'trusted' && (
        <div className="flex flex-col gap-2">
          <p>
            Fingerprint {c.fingerprint}. Confirmed {c.confirmedAt ? format(c.confirmedAt, 'PP') : ''}
            {c.confirmedBy ? ` by ${c.confirmedBy}` : ''}. Highest package number received: {c.lastSeqIn}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Reason for ending the connection" placeholder="To end this connection, say why" className="max-w-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={revoke.isPending || !reason.trim()} onClick={() => revoke.mutate()}>
              End the connection
            </Button>
          </div>
        </div>
      )}

      {(c.state === 'revoked' || c.state === 'declined') && c.revokedReason && <p>{c.revokedReason}</p>}
    </div>
  )
}

/** Who this office is, which stations it has invited, and which it trusts. A
 * station is trusted only after a person here has confirmed its fingerprint with
 * the station itself. */
export function ConnectionsView() {
  const { data: identity } = useIdentity()
  const { data: connections } = useConnections()

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Police connections</h1>
          <p>Which police stations may send files to this office. A station sends here only if this office invited it and a person here has confirmed who it is.</p>
        </div>
        <div className="page-actions">
          <ImportButton label="Import a station's answer" variant="secondary" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IdentityCard />
        <InviteCard disabled={!identity} />
      </div>

      <section className="page-section">
        <h2>Stations</h2>
        {connections.length === 0 ? (
          <EmptyNote>No station has been invited. Invite the stations this office handles.</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {connections.map((c) => (
              <ConnectionRow key={c.id} connection={c} />
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
