import { formatDate } from '@/lib/dates'
import { serviceNames } from '@/lib/jurisdiction'
import { SettingsCard } from '@/components/settings-card'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { createIdentity, createInvite, declineConnection, revokeConnection, saveFile, trustConnection } from './data'
import { ImportButton } from './import-button'
import { useConnections, useIdentity } from './queries'
import { connectionStates, type Connection } from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : typeof error === 'string' ? error : m["common.try_again"]())

function IdentityCard() {
  const { data: identity } = useIdentity()
  const [name, setName] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const create = useMutation({
    mutationFn: () => createIdentity(name, jurisdiction),
    onSuccess: () => t.success(m["interchange.conn.identity_created"]()),
    onError: (e) => t.error(m["interchange.conn.identity_failed"](), { description: say(e) }),
  })

  if (identity) {
    return (
      <SettingsCard
        title={identity.officeName}
        badge={<Tag tone="done">{m["interchange.conn.identity_set"]()}</Tag>}
        description={identity.jurisdiction ? m["interchange.conn.handles"]({ area: identity.jurisdiction }) : m["interchange.conn.known_as"]()}
        hint={m["interchange.conn.fingerprint_hint"]()}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["interchange.conn.fingerprint_label"]()}</span>
          <code className="w-fit rounded-md bg-muted px-3 py-2 text-lg font-semibold tracking-wider text-foreground">{identity.fingerprint}</code>
        </div>
      </SettingsCard>
    )
  }
  return (
    <SettingsCard
      title={m["interchange.conn.identify"]()}
      description={m["interchange.conn.identify_description"]()}
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
      action={
        <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
          {m["interchange.conn.create_identity"]()}
        </Button>
      }
    >
      <Input aria-label={m["interchange.conn.office_name"]()} placeholder={m["interchange.conn.office_placeholder"]({ office: serviceNames().short })} value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label={m["interchange.conn.area"]()} placeholder={m["interchange.conn.area_placeholder"]()} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
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
      t.success(m["interchange.conn.invited"]())
      setStation('')
    },
    onError: (e) => t.error(m["interchange.conn.invite_failed"](), { description: say(e) }),
  })
  return (
    <SettingsCard
      title={m["interchange.conn.invite_title"]()}
      description={m["interchange.conn.invite_description"]()}
      hint={m["interchange.conn.invite_hint"]()}
      onSubmit={(e) => {
        e.preventDefault()
        invite.mutate()
      }}
      action={
        <Button type="submit" size="sm" disabled={disabled || invite.isPending || !station.trim()}>
          {m["interchange.conn.make_invite"]()}
        </Button>
      }
    >
      <Input aria-label={m["interchange.conn.station"]()} placeholder={m["interchange.conn.station_placeholder"]()} value={station} onChange={(e) => setStation(e.target.value)} disabled={disabled} />
      <label className="flex items-center justify-between gap-3">
        <span>{m["interchange.conn.open_for"]()}</span>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {m["count.day.many"]({ count: d })}
            </option>
          ))}
        </select>
      </label>
      {disabled && <p>{m["interchange.conn.identify_first"]()}</p>}
    </SettingsCard>
  )
}

function ConnectionRow({ connection: c }: { connection: Connection }) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const state = connectionStates[c.state] ?? { label: c.state, tone: 'stopped' as const }
  const trust = useMutation({ mutationFn: () => trustConnection(c.id, typed), onSuccess: () => t.success(m["interchange.conn.trusted_toast"]()), onError: (e) => t.error(m["interchange.review.not_trusted"](), { description: say(e) }) })
  const decline = useMutation({ mutationFn: () => declineConnection(c.id, reason), onError: (e) => t.error(m["interchange.conn.decline_failed"](), { description: say(e) }) })
  const revoke = useMutation({ mutationFn: () => revokeConnection(c.id, reason), onSuccess: () => t.success(m["interchange.conn.ended"]()), onError: (e) => t.error(m["interchange.conn.end_failed"](), { description: say(e) }) })
  const resend = useMutation({ mutationFn: () => saveFile('invite', c.id), onError: (e) => t.error(m["interchange.conn.save_invite_failed"](), { description: say(e) }) })

  return (
    <div role="listitem" className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{c.stationName ?? c.intendedStation}</strong>
        <Tag tone={state.tone}>{state.label}</Tag>
        {c.state === 'trusted' && c.waiting > 0 && <Tag tone="open">{m["interchange.conn.waiting"]({ count: c.waiting })}</Tag>}
        <span className="ml-auto text-muted-foreground">{m["interchange.conn.invited_on"]({ date: formatDate(c.createdAt) })}</span>
      </div>

      {c.state === 'invited' && (
        <div className="flex flex-wrap items-center gap-3">
          <p>{m["interchange.conn.waiting_answer"]({ station: c.intendedStation, date: formatDate(c.inviteExpiresAt) })}</p>
          <Button size="sm" variant="outline" onClick={() => resend.mutate()}>
            {m["interchange.conn.save_again"]()}
          </Button>
        </div>
      )}

      {c.state === 'awaiting_confirmation' && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p>
            <strong>{c.stationName}</strong>{c.stationJurisdiction ? ` (${c.stationJurisdiction})` : ''}
            {c.officerInCharge ? `, ${m["interchange.conn.officer_in_charge"]({ name: c.officerInCharge })}` : ''} {m["interchange.conn.answered"]()}
          </p>
          <code className="w-fit rounded-md bg-background px-3 py-2 text-lg font-semibold tracking-wider text-foreground">{c.fingerprint}</code>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={m["interchange.conn.fingerprint_read"]()} placeholder={m["interchange.conn.fingerprint_placeholder"]()} className="max-w-xs" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Button size="sm" disabled={trust.isPending || typed.replace(/[^0-9a-f]/gi, '').length < 20} onClick={() => trust.mutate()}>
              {m["interchange.conn.trust"]()}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={m["interchange.conn.decline_reason"]()} placeholder={m["interchange.conn.decline_placeholder"]()} className="max-w-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={decline.isPending} onClick={() => decline.mutate()}>
              {m["interchange.conn.decline"]()}
            </Button>
          </div>
        </div>
      )}

      {c.state === 'trusted' && (
        <div className="flex flex-col gap-2">
          <p>
            {m["interchange.conn.trusted_detail"]({ fingerprint: c.fingerprint ?? "", date: c.confirmedAt ? formatDate(c.confirmedAt) : '', by: c.confirmedBy ? ` (${c.confirmedBy})` : '', seq: c.lastSeqIn })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={m["interchange.conn.end_reason"]()} placeholder={m["interchange.conn.end_placeholder"]()} className="max-w-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={revoke.isPending || !reason.trim()} onClick={() => revoke.mutate()}>
              {m["interchange.conn.end"]()}
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
          <h1>{m["nav.item.police_connections"]()}</h1>
          <p>{m["interchange.conn.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <ImportButton label={m["interchange.conn.import_answer"]()} variant="secondary" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IdentityCard />
        <InviteCard disabled={!identity} />
      </div>

      <section className="page-section">
        <h2>{m["interchange.conn.stations"]()}</h2>
        {connections.length === 0 ? (
          <EmptyNote>{m["interchange.conn.empty"]()}</EmptyNote>
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
