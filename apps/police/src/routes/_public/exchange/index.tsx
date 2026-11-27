import { StationTabs } from '@/features/station-desk'
import * as m from '@/paraglide/messages'
import { acceptInvite, createIdentity, exportReferral, getIdentity, importPackage, listConnections, listIncoming, pickPackage, savePackage, type Connection, type Incoming, type StationIdentity } from '@/features/exchange/data'
import { answerInvitation, checkRelay, declineInvitation, getRelay, reopenReceived, retryRelay, sendByPostbox, type RelayStatus, type Stage } from '@/features/relay/data'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { SettingsCard } from '@/components/settings-card'
import { MinutesCard } from '@/features/exchange/minutes-card'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/exchange/')({ component: RouteComponent })

type Referral = { id: string; caseReference: string; destinationName: string | null; referredAt: number }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function RouteComponent() {
  const [identity, setIdentity] = useState<StationIdentity | null | undefined>(undefined)
  const [connections, setConnections] = useState<Connection[]>([])
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [inCharge, setInCharge] = useState('')
  const [relay, setRelay] = useState<RelayStatus | null>(null)

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (id) {
      setConnections(await listConnections())
      setIncoming(await listIncoming())
      setReferrals(await api('/referrals?query='))
      setRelay(await getRelay().catch(() => null))
    }
  }, [])
  useEffect(() => {
    load().catch((e) => setNotice({ text: message(e), error: true }))
  }, [load])

  const run = async (work: () => Promise<string | void>) => {
    try {
      const text = await work()
      if (text) setNotice({ text })
      await load()
    } catch (e) {
      setNotice({ text: message(e), error: true })
    }
  }

  const trusted = connections.some((c) => c.status === 'trusted')
  // With nothing trusted, say so when the newest connection is one the office ended, rather than "no office has confirmed".
  const newest = [...connections].sort((a, b) => b.respondedAt - a.respondedAt)[0]
  const ended = !trusted && newest?.status === 'revoked' ? newest : undefined
  const stageLabel: Record<Stage, string> = {
    queued: m['relay.stage_queued'](),
    sent: m['relay.stage_sent'](),
    delivered: m['relay.stage_delivered'](),
    opened: m['relay.stage_opened'](),
    accepted: m['relay.stage_accepted'](),
    rejected: m['relay.stage_rejected'](),
    refused: m['relay.stage_refused'](),
    attention: m['relay.stage_attention'](),
    expired: m['relay.stage_expired'](),
  }
  const invitations = (relay?.received ?? []).filter((r) => r.status === 'new' && r.invitation)
  const turnedAway = (relay?.received ?? []).filter((r) => r.status === 'refused')
  const replies = incoming.filter((i) => i.kind !== 'hearing_minute')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav_sections.station"]()}</h1>
          <p className="text-muted-foreground">{m['exchange.intro']()}</p>
        </div>
        <Link to="/postbox" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m['nav.postbox']()}</Link>
      </header>

      <StationTabs active="exchange" />

      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        {identity === null && (
          <SettingsCard
            title={m['exchange.identity_title']()}
            description={m['exchange.identity_hint']()}
            action={<Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>{m['exchange.identity_create']()}</Button>}
          >
            <div className="flex flex-wrap gap-2">
              <Input aria-label={m['exchange.station_name']()} placeholder={m['exchange.station_name']()} value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:w-72" />
              <Input aria-label={m['exchange.area']()} placeholder={m['exchange.area']()} value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-56" />
            </div>
          </SettingsCard>
        )}

        {identity && (
          <>
            <SettingsCard title={m['exchange.identity_title']()}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{identity.stationName}</span>
                <span className="text-muted-foreground">{m['exchange.fingerprint']()} <span className="font-mono">{identity.fingerprint}</span></span>
              </div>
            </SettingsCard>

            <SettingsCard
              title={m['exchange.offices_title']()}
              description={m['exchange.offices_hint']()}
              action={
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(async () => {
                        const file = await pickPackage()
                        if (!file) return
                        return (await importPackage(file)).message
                      })
                    }
                  >
                    {m['exchange.import']()}
                  </Button>
                  <Button
                    onClick={() =>
                      run(async () => {
                        const file = await pickPackage()
                        if (!file) return
                        const answered = await acceptInvite(file, inCharge)
                        await savePackage(answered)
                        return m['exchange.answer_saved']({ office: answered.connection.officeName, code: answered.connection.fingerprint })
                      })
                    }
                  >
                    {m['exchange.answer_invite']()}
                  </Button>
                </>
              }
            >
              <div>
                <Input aria-label={m['exchange.in_charge']()} placeholder={m['exchange.in_charge']()} value={inCharge} onChange={(e) => setInCharge(e.target.value)} className="w-full sm:w-72" />
              </div>
              {connections.length === 0 ? (
                <p className="text-muted-foreground">{m['exchange.no_offices']()}</p>
              ) : (
                connections.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {c.officeName}
                        <Badge variant={c.status === 'trusted' ? 'default' : 'secondary'}>{statusLabel(c.status)}</Badge>
                      </span>
                      {c.status === 'revoked' && c.reason && <span className="text-muted-foreground">{m['exchange.ended_reason']({ reason: c.reason })}</span>}
                    </span>
                    <span className="font-mono text-muted-foreground">{c.fingerprint}</span>
                  </div>
                ))
              )}
            </SettingsCard>

            <SettingsCard title={m['exchange.send_title']()} description={trusted ? m['exchange.send_hint']() : ended ? m['exchange.send_ended']({ office: ended.officeName }) : m['exchange.send_blocked']()}>
              {referrals.length === 0 ? (
                <p className="text-muted-foreground">{m['exchange.no_referrals']()}</p>
              ) : (
                referrals.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {r.caseReference} <span className="text-muted-foreground">· {format(r.referredAt, 'PP')}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!trusted}
                      onClick={() =>
                        run(async () => {
                          const sealed = await exportReferral(r.id, 'file')
                          if (await savePackage(sealed)) return m['exchange.sent_file']({ name: sealed.name })
                        })
                      }
                    >
                      {m['exchange.save_file']()}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!trusted || !relay?.ready}
                      onClick={() =>
                        run(async () => {
                          await sendByPostbox(r.id)
                          return m['relay.queued']()
                        })
                      }
                    >
                      {m['relay.send_postbox']()}
                    </Button>
                  </div>
                ))
              )}
            </SettingsCard>

            <SettingsCard
              title={m['relay.title']()}
              description={relay?.ready ? m['relay.hint']({ address: relay.address ?? '' }) : m['relay.needs_licence']()}
              action={
                <Button variant="secondary" disabled={!relay?.ready} onClick={() => run(async () => void setRelay(await checkRelay()))}>
                  {m['relay.check_now']()}
                </Button>
              }
            >
              {relay?.last.error && <p className="text-destructive">{m['relay.last_failed']({ error: relay.last.error })}</p>}
              {invitations.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span>{m['relay.invitation_from']({ office: r.invitation!.officeName })}</span>
                    <span className="text-muted-foreground">{m['exchange.fingerprint']()} <span className="font-mono">{r.invitation!.fingerprint}</span></span>
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => run(async () => void setRelay(await answerInvitation(r.id, inCharge)))}>{m['relay.answer']()}</Button>
                    <Button size="sm" variant="secondary" onClick={() => run(async () => void setRelay(await declineInvitation(r.id, '')))}>{m['relay.decline']()}</Button>
                  </span>
                </div>
              ))}
              {(relay?.sent ?? []).map((x) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span>{x.policeReference ?? x.kind} {x.office ? <span className="text-muted-foreground">· {x.office}</span> : null}</span>
                    {x.error && <span className="text-destructive">{x.error}</span>}
                    {x.reason && <span className="text-muted-foreground">{x.reason}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={x.stage === 'accepted' ? 'default' : x.stage === 'attention' || x.stage === 'rejected' || x.stage === 'refused' ? 'destructive' : 'secondary'}>{stageLabel[x.stage]}</Badge>
                    {(x.stage === 'attention' || x.stage === 'queued') && <Button size="sm" variant="secondary" onClick={() => run(async () => void setRelay(await retryRelay(x.id)))}>{m['relay.retry']()}</Button>}
                  </span>
                </div>
              ))}
              {turnedAway.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span>{m['relay.turned_away']({ kind: r.kind, from: r.from })}</span>
                    <span className="text-destructive">{r.reason}</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => run(async () => void setRelay(await reopenReceived(r.id)))}>{m['relay.retry']()}</Button>
                </div>
              ))}
              {relay?.ready && relay.sent.length === 0 && invitations.length === 0 && turnedAway.length === 0 && <p className="text-muted-foreground">{m['relay.nothing']()}</p>}
            </SettingsCard>

            <MinutesCard minutes={incoming.filter((i) => i.kind === 'hearing_minute')} canPostbox={!!relay?.ready} run={run} />

            <SettingsCard title={m['exchange.incoming_title']()}>
              {replies.length === 0 ? (
                <p className="text-muted-foreground">{m['exchange.no_incoming']()}</p>
              ) : (
                replies.map((i) => {
                  const body = safe(i.payload)
                  return (
                    <div key={i.id} className="flex flex-col gap-0.5">
                      <span>{i.kind === 'receipt' ? (safe(i.payload).outcome === 'received' ? m['relay.stage_opened']() : m['exchange.receipt']()) : m['exchange.decision']()} · {i.officeName} · {format(i.receivedAt, 'PP')}</span>
                      <span className="text-muted-foreground">{[body.policeReference, answerLabel(body), body.dppReference, body.reason].filter(Boolean).join(' · ')}</span>
                    </div>
                  )
                })
              )}
            </SettingsCard>
          </>
        )}
      </div>
    </article>
  )
}

function statusLabel(status: string) {
  const labels: Record<string, () => string> = {
    answered: m['exchange.status_answered'],
    trusted: m['exchange.status_trusted'],
    declined: m['exchange.status_declined'],
    revoked: m['exchange.status_revoked'],
  }
  return labels[status]?.() ?? status
}

function safe(payload: string): Record<string, string | undefined> {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

// What the office answered, in words for the officer. Anything this version does not know is shown as sent, never hidden.
function answerLabel(body: Record<string, string | undefined>): string | undefined {
  const raw = body.outcome ?? body.decisionType
  if (!raw) return undefined
  const key = body.outcome ? (`exchange.outcome.${raw}` as const) : (`exchange.decision_type.${raw}` as const)
  const known = key in m
  return known ? (m as unknown as Record<string, () => string>)[key]() : raw
}
