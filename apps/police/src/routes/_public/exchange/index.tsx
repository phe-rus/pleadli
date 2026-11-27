import { StationTabs } from '@/features/station-desk'
import * as m from '@/paraglide/messages'
import { acceptInvite, getIdentity, importPackage, listConnections, listIncoming, pickPackage, savePackage, type Connection, type Incoming, type StationIdentity } from '@/features/exchange/data'
import { answerInvitation, declineInvitation, getRelay, reopenReceived, retryRelay, type RelayStatus, type Stage } from '@/features/relay/data'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { SettingsCard } from '@/components/settings-card'
import { MinutesCard } from '@/features/exchange/minutes-card'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMe } from '@/features/session'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/exchange/')({ component: RouteComponent })


/** What went wrong, in words an officer can act on. A file of the wrong kind says which button it belongs to. */
const message = (e: unknown) => {
  const text = e instanceof Error ? e.message : String(e)
  if (text.includes("'pairing_invite'")) return m['exchange.plain.wrong_invitation']()
  if (text.includes("'pairing_answer'")) return m['exchange.plain.wrong_reply']()
  return text
}

function RouteComponent() {
  const [identity, setIdentity] = useState<StationIdentity | null | undefined>(undefined)
  const [connections, setConnections] = useState<Connection[]>([])
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  const inCharge = useMe().data?.name ?? ''

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (id) {
      setConnections(await listConnections())
      setIncoming(await listIncoming())
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

  const trusted = connections.filter((c) => c.status === 'trusted')
  const waiting = connections.filter((c) => c.status === 'answered')
  const newest = [...connections].sort((a, b) => b.respondedAt - a.respondedAt)[0]
  const ended = trusted.length === 0 && newest?.status === 'revoked' ? newest : undefined
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
  const sent = relay?.sent ?? []

  const openInvitation = () =>
    run(async () => {
      const file = await pickPackage()
      if (!file) return
      const answered = await acceptInvite(file, inCharge)
      await savePackage(answered)
      return m['exchange.plain.reply_saved']({ office: answered.connection.officeName })
    })

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav_sections.station"]()}</h1>
          <p className="text-muted-foreground">{m['exchange.plain.intro']()}</p>
        </div>
        <Link to="/postbox" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m['nav.postbox']()}</Link>
      </header>

      <StationTabs active="exchange" />

      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        {identity === null && <p className="text-muted-foreground">{m['exchange.plain.name_first']()}</p>}

        {identity && (
          <>
            <SettingsCard
              title={m['exchange.plain.office_title']()}
              description={trusted.length > 0 ? m['exchange.plain.connected_hint']() : waiting.length > 0 ? m['exchange.plain.give_reply']() : ended ? m['exchange.send_ended']({ office: ended.officeName }) : m['exchange.plain.not_connected']()}
              action={
                <>
                  {trusted.length === 0 && <Button onClick={openInvitation}>{m['exchange.plain.open_invitation']()}</Button>}
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
                    {m['exchange.plain.open_file']()}
                  </Button>
                </>
              }
            >
              {invitations.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span>{m['exchange.plain.invited_by']({ office: r.invitation!.officeName })}</span>
                    <span className="text-muted-foreground">{m['exchange.plain.office_code']({ code: r.invitation!.fingerprint })}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => run(async () => void setRelay(await answerInvitation(r.id, inCharge)))}>{m['exchange.plain.accept']()}</Button>
                    <Button size="sm" variant="secondary" onClick={() => run(async () => void setRelay(await declineInvitation(r.id, '')))}>{m['relay.decline']()}</Button>
                  </span>
                </div>
              ))}
              {trusted.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{c.officeName}</span>
                  <Badge>{m['exchange.status_trusted']()}</Badge>
                </div>
              ))}
              {waiting.map((c) => (
                <div key={c.id} className="flex flex-col gap-0.5">
                  <span>{m['exchange.plain.waiting']({ office: c.officeName })}</span>
                  <span className="text-muted-foreground">{m['exchange.plain.check_codes']({ station: identity.fingerprint, office: c.fingerprint })}</span>
                </div>
              ))}
            </SettingsCard>

            {(sent.length > 0 || turnedAway.length > 0 || relay?.last.error) && (
              <SettingsCard title={m['exchange.plain.sent_title']()}>
                {relay?.last.error && <p className="text-destructive">{m['relay.last_failed']({ error: plainError(relay.last.error) })}</p>}
                {sent.map((x) => (
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
              </SettingsCard>
            )}

            <MinutesCard minutes={incoming.filter((i) => i.kind === 'hearing_minute')} canPostbox={!!relay?.ready} run={run} />

            <SettingsCard title={m['exchange.plain.from_title']()}>
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

            <details className="text-muted-foreground">
              <summary className="cursor-pointer">{m['exchange.plain.details']()}</summary>
              <p className="pt-2">{identity.stationName} · {m['exchange.fingerprint']()} <span className="font-mono">{identity.fingerprint}</span></p>
            </details>
          </>
        )}
      </div>
    </article>
  )
}

/** A code the relay reports, in words an officer can act on. Anything unknown is shown as it came. */
function plainError(error: string): string {
  if (error === 'licence_needed') return m['exchange.plain.err_licence']()
  return error
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
