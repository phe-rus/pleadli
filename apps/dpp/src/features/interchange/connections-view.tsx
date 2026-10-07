import { formatDate } from '@/lib/dates'
import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { useBrand } from '@/features/installation'
import { ApiError } from '@/lib/api'
import { CheckmarkCircle02Icon, PoliceCapIcon, Shield01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Segmented } from '@pleadli/ui/segmented'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { createIdentity, createInvite, declineConnection, revokeConnection, saveFile, trustConnection } from './data'
import { ImportButton } from './import-button'
import { useConnections, useIdentity } from './queries'
import { connectionStates, type Connection } from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : typeof error === 'string' ? error : m["common.try_again"]())

/** The code a station and this office read to each other, in groups so it can be said aloud. */
const spaced = (code: string | null | undefined) => (code ?? '').replace(/[^0-9a-f]/gi, '').replace(/(.{4})/g, '$1 ').trim().toUpperCase()

/**
 * Adding a station, as a phone pairs with something new: name the station,
 * hand it the invitation, open its reply when it comes. The office's own
 * identity is made on the way, from the name already set for this office, so
 * there is no separate step for it.
 */
function AddStation({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: identity } = useIdentity()
  const { data: brand } = useBrand()
  const [station, setStation] = useState('')
  const [days, setDays] = useState<'7' | '14' | '30'>('14')
  const [made, setMade] = useState<Connection | null>(null)
  const invite = useMutation({
    mutationFn: async () => {
      if (!identity) await createIdentity(brand?.officeName ?? '', '')
      const connection = await createInvite(station.trim(), Number(days))
      await saveFile('invite', connection.id)
      return connection
    },
    onSuccess: (c) => setMade(c),
    onError: (e) => t.error(m["interchange.conn.invite_failed"](), { description: say(e) }),
  })
  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setMade(null)
      setStation('')
    }
  }

  return (
    <Createpanel open={open} onOpenChange={close} headings={{ title: m["stations.add"](), description: m["stations.add_lead"]() }}>
      {!made ? (
        <form
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate()
          }}
        >
          <ol className="flex list-none flex-col gap-3 p-0 text-muted-foreground">
            <li>{m["stations.step1"]()}</li>
            <li>{m["stations.step2"]()}</li>
            <li>{m["stations.step3"]()}</li>
          </ol>
          <label className="flex flex-col gap-1.5">
            <span>{m["stations.which"]()}</span>
            <Input autoFocus placeholder={m["interchange.conn.station_placeholder"]()} value={station} onChange={(e) => setStation(e.target.value)} />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span>{m["stations.valid_for"]()}</span>
            <Segmented
              label={m["stations.valid_for"]()}
              size="sm"
              value={days}
              onChange={setDays}
              items={(['7', '14', '30'] as const).map((d) => ({ value: d, label: m["count.day.many"]({ count: Number(d) }) }))}
            />
          </div>
          <Button type="submit" disabled={invite.isPending || !station.trim()}>
            {m["stations.make_invitation"]()}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-4 p-4 py-8 text-center">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-10 text-green-600" />
          <h3>{m["stations.invitation_ready"]({ station: made.intendedStation })}</h3>
          <p className="text-muted-foreground">{m["stations.send_it"]({ date: formatDate(made.inviteExpiresAt) })}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => void saveFile('invite', made.id)}>
              {m["interchange.conn.save_again"]()}
            </Button>
            <Button onClick={() => close(false)}>{m["common.done"]()}</Button>
          </div>
        </div>
      )}
    </Createpanel>
  )
}

/** One station opened: where things stand with it and the one thing to do next. */
function StationPanel({ connection: c, onClose }: { connection: Connection; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const trust = useMutation({ mutationFn: () => trustConnection(c.id, typed), onSuccess: () => t.success(m["interchange.conn.trusted_toast"]()), onError: (e) => t.error(m["interchange.review.not_trusted"](), { description: say(e) }) })
  const decline = useMutation({ mutationFn: () => declineConnection(c.id, reason), onSuccess: onClose, onError: (e) => t.error(m["interchange.conn.decline_failed"](), { description: say(e) }) })
  const revoke = useMutation({ mutationFn: () => revokeConnection(c.id, reason), onSuccess: () => { t.success(m["interchange.conn.ended"]()); onClose() }, onError: (e) => t.error(m["interchange.conn.end_failed"](), { description: say(e) }) })

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
      {c.state === 'invited' && (
        <Group footer={m["interchange.conn.waiting_answer"]({ station: c.intendedStation, date: formatDate(c.inviteExpiresAt) })}>
          <GroupRow label={m["stations.invitation"]()} value={<Button size="xs" variant="secondary" onClick={() => void saveFile('invite', c.id)}>{m["interchange.conn.save_again"]()}</Button>} />
          <GroupRow label={m["stations.reply"]()} value={<ImportButton label={m["stations.open_reply"]()} variant="secondary" />} />
        </Group>
      )}

      {c.state === 'awaiting_confirmation' && (
        <div className="flex flex-col gap-4">
          <p>
            <strong>{c.stationName}</strong>
            {c.stationJurisdiction ? ` (${c.stationJurisdiction})` : ''}
            {c.officerInCharge ? `, ${m["interchange.conn.officer_in_charge"]({ name: c.officerInCharge })}` : ''} {m["interchange.conn.answered"]()}
          </p>
          <div className="flex flex-col items-center gap-2 rounded-xl bg-foreground/[0.03] p-5 text-center">
            <span className="text-[0.8125rem] text-muted-foreground">{m["stations.their_code"]()}</span>
            <code className="font-mono text-xl font-semibold tracking-widest">{spaced(c.fingerprint)}</code>
            <p className="text-[0.8125rem] text-muted-foreground">{m["stations.check_code"]()}</p>
          </div>
          <Input aria-label={m["interchange.conn.fingerprint_read"]()} placeholder={m["stations.type_code"]()} value={typed} onChange={(e) => setTyped(e.target.value)} />
          <Button disabled={trust.isPending || typed.replace(/[^0-9a-f]/gi, '').length < 20} onClick={() => trust.mutate()}>
            {m["stations.connect"]()}
          </Button>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">{m["stations.does_not_match"]()}</summary>
            <div className="mt-3 flex flex-col gap-2">
              <Input aria-label={m["interchange.conn.decline_reason"]()} placeholder={m["interchange.conn.decline_placeholder"]()} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="destructive" size="sm" disabled={decline.isPending} onClick={() => decline.mutate()}>
                {m["interchange.conn.decline"]()}
              </Button>
            </div>
          </details>
        </div>
      )}

      {c.state === 'trusted' && (
        <>
          <Group>
            <GroupRow label={m["stations.connected_since"]()} value={c.confirmedAt ? formatDate(c.confirmedAt) : ''} />
            {c.confirmedBy && <GroupRow label={m["stations.confirmed_by"]()} value={c.confirmedBy} />}
            <GroupRow label={m["stations.their_code"]()} value={<code className="font-mono text-xs">{spaced(c.fingerprint)}</code>} />
            <GroupRow label={m["stations.packages"]()} value={c.lastSeqIn} />
          </Group>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">{m["interchange.conn.end"]()}</summary>
            <div className="mt-3 flex flex-col gap-2">
              <Input aria-label={m["interchange.conn.end_reason"]()} placeholder={m["interchange.conn.end_placeholder"]()} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="destructive" size="sm" disabled={revoke.isPending || !reason.trim()} onClick={() => revoke.mutate()}>
                {m["interchange.conn.end"]()}
              </Button>
            </div>
          </details>
        </>
      )}

      {(c.state === 'revoked' || c.state === 'declined' || c.state === 'expired') && <p className="text-muted-foreground">{c.revokedReason ?? connectionStates[c.state]?.label}</p>}
    </div>
  )
}

/** What a station's row says under its name: where it stands, in a sentence. */
function stationLine(c: Connection) {
  switch (c.state) {
    case 'invited':
      return m["stations.line.invited"]({ date: formatDate(c.inviteExpiresAt) })
    case 'awaiting_confirmation':
      return m["stations.line.check"]()
    case 'trusted':
      return c.waiting > 0 ? m["interchange.conn.waiting"]({ count: c.waiting }) : m["stations.line.connected"]()
    default:
      return connectionStates[c.state]?.label ?? c.state
  }
}

/**
 * The police stations that may send files here. Adding one is a short guided
 * sheet; each station opens to show where things stand and the next step. A
 * station is trusted only after a person here has checked its code with the
 * station itself.
 */
export function ConnectionsView() {
  const { data: identity } = useIdentity()
  const { data: connections } = useConnections()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const opened = connections.find((c) => c.id === openId) ?? null

  return (
    <article className="page page-narrow">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.police_stations"]()}</h1>
          <p>{m["stations.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <Button size="sm" onClick={() => setAdding(true)}>
            {m["stations.add"]()}
          </Button>
        </div>
      </header>

      {connections.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={PoliceCapIcon} />} action={<Button onClick={() => setAdding(true)}>{m["stations.add"]()}</Button>}>
          {m["stations.empty"]()}
        </EmptyNote>
      ) : (
        <Group title={m["interchange.conn.stations"]()}>
          {connections.map((c) => {
            const state = connectionStates[c.state] ?? { label: c.state, tone: 'stopped' as const }
            return (
              <GroupRow
                key={c.id}
                icon={
                  <RowIcon tone={c.state === 'trusted' ? 'blue' : c.state === 'awaiting_confirmation' ? 'orange' : 'gray'}>
                    <HugeiconsIcon icon={PoliceCapIcon} />
                  </RowIcon>
                }
                label={c.stationName ?? c.intendedStation}
                detail={stationLine(c)}
                value={c.state === 'awaiting_confirmation' ? <Tag tone={state.tone}>{state.label}</Tag> : undefined}
                chevron
                onClick={() => setOpenId(c.id)}
              />
            )
          })}
        </Group>
      )}

      {identity && (
        <Group title={m["stations.this_office"]()} footer={m["interchange.conn.fingerprint_hint"]()}>
          <GroupRow
            icon={
              <RowIcon tone="green">
                <HugeiconsIcon icon={Shield01Icon} />
              </RowIcon>
            }
            label={identity.officeName}
            detail={identity.jurisdiction ?? undefined}
            value={<code className="font-mono text-xs">{spaced(identity.fingerprint)}</code>}
          />
        </Group>
      )}

      <AddStation open={adding} onOpenChange={setAdding} />
      <Createpanel open={!!opened} onOpenChange={(o) => !o && setOpenId(null)} headings={{ title: opened ? (opened.stationName ?? opened.intendedStation) : '', description: opened ? stationLine(opened) : '' }}>
        {opened && <StationPanel connection={opened} onClose={() => setOpenId(null)} />}
      </Createpanel>
    </article>
  )
}
