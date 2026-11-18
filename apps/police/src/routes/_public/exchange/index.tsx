import * as m from '@/paraglide/messages'
import { acceptInvite, createIdentity, exportReferral, getIdentity, importPackage, listConnections, listIncoming, pickPackage, savePackage, type Connection, type Incoming, type StationIdentity } from '@/features/exchange/data'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/exchange/')({ component: RouteComponent })

type Referral = { id: string; caseReference: string; destinationName: string | null; referredAt: number }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border/60 py-6 first:pt-0">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="max-w-2xl text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

function RouteComponent() {
  const [identity, setIdentity] = useState<StationIdentity | null | undefined>(undefined)
  const [connections, setConnections] = useState<Connection[]>([])
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [inCharge, setInCharge] = useState('')

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (id) {
      setConnections(await listConnections())
      setIncoming(await listIncoming())
      setReferrals(await api('/referrals?query='))
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

  return (
    <div className="flex max-w-3xl flex-col">
      <h1 className="mb-1 text-2xl font-semibold">{m['exchange.title']()}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{m['exchange.intro']()}</p>
      {notice && <p role="status" className={notice.error ? 'mb-4 text-sm text-destructive' : 'mb-4 text-sm'}>{notice.text}</p>}

      {identity === null && (
        <Section title={m['exchange.identity_title']()} hint={m['exchange.identity_hint']()}>
          <div className="flex flex-wrap gap-2">
            <Input aria-label={m['exchange.station_name']()} placeholder={m['exchange.station_name']()} value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
            <Input aria-label={m['exchange.area']()} placeholder={m['exchange.area']()} value={area} onChange={(e) => setArea(e.target.value)} className="w-48" />
            <Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>{m['exchange.identity_create']()}</Button>
          </div>
        </Section>
      )}

      {identity && (
        <>
          <Section title={m['exchange.identity_title']()}>
            <p className="text-sm">{identity.stationName}</p>
            <p className="text-sm text-muted-foreground">{m['exchange.fingerprint']()} <span className="font-mono">{identity.fingerprint}</span></p>
          </Section>

          <Section title={m['exchange.offices_title']()} hint={m['exchange.offices_hint']()}>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={m['exchange.in_charge']()} placeholder={m['exchange.in_charge']()} value={inCharge} onChange={(e) => setInCharge(e.target.value)} className="w-56" />
              <Button
                variant="secondary"
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
            </div>
            {connections.length === 0 ? <p className="text-sm text-muted-foreground">{m['exchange.no_offices']()}</p> : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {connections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{c.officeName}</span>
                    <Badge variant={c.status === 'trusted' ? 'default' : 'secondary'}>{m[`exchange.status_${c.status}` as 'exchange.status_trusted']?.() ?? c.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{c.fingerprint}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={m['exchange.send_title']()} hint={trusted ? m['exchange.send_hint']() : m['exchange.send_blocked']()}>
            {referrals.length === 0 ? <p className="text-sm text-muted-foreground">{m['exchange.no_referrals']()}</p> : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>{r.caseReference} <span className="text-muted-foreground">· {format(r.referredAt, 'PP')}</span></span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="secondary" disabled={!trusted} onClick={() => run(async () => { const sealed = await exportReferral(r.id, 'file'); if (await savePackage(sealed)) return m['exchange.sent_file']({ name: sealed.name }) })}>
                        {m['exchange.save_file']()}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={m['exchange.incoming_title']()}>
            {incoming.length === 0 ? <p className="text-sm text-muted-foreground">{m['exchange.no_incoming']()}</p> : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {incoming.map((i) => {
                  const body = safe(i.payload)
                  return (
                    <li key={i.id} className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">{i.kind === 'receipt' ? m['exchange.receipt']() : m['exchange.decision']()} · {i.officeName} · {format(i.receivedAt, 'PP')}</span>
                      <span className="text-muted-foreground">{[body.policeReference, body.outcome ?? body.decisionType, body.dppReference, body.reason].filter(Boolean).join(' · ')}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function safe(payload: string): Record<string, string | undefined> {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}
