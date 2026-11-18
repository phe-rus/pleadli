import * as m from '@/paraglide/messages'
import { acceptInvite, createIdentity, exportReferral, getIdentity, importPackage, listConnections, listIncoming, pickPackage, savePackage, type Connection, type Incoming, type StationIdentity } from '@/features/exchange/data'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { SettingsCard } from '@/components/settings-card'
import { createFileRoute } from '@tanstack/react-router'
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
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m['exchange.title']()}</h1>
          <p className="text-muted-foreground">{m['exchange.intro']()}</p>
        </div>
      </header>

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
                    <span className="flex items-center gap-2">
                      {c.officeName}
                      <Badge variant={c.status === 'trusted' ? 'default' : 'secondary'}>{statusLabel(c.status)}</Badge>
                    </span>
                    <span className="font-mono text-muted-foreground">{c.fingerprint}</span>
                  </div>
                ))
              )}
            </SettingsCard>

            <SettingsCard title={m['exchange.send_title']()} description={trusted ? m['exchange.send_hint']() : m['exchange.send_blocked']()}>
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
                  </div>
                ))
              )}
            </SettingsCard>

            <SettingsCard title={m['exchange.incoming_title']()}>
              {incoming.length === 0 ? (
                <p className="text-muted-foreground">{m['exchange.no_incoming']()}</p>
              ) : (
                incoming.map((i) => {
                  const body = safe(i.payload)
                  return (
                    <div key={i.id} className="flex flex-col gap-0.5">
                      <span>{i.kind === 'receipt' ? m['exchange.receipt']() : m['exchange.decision']()} · {i.officeName} · {format(i.receivedAt, 'PP')}</span>
                      <span className="text-muted-foreground">{[body.policeReference, body.outcome ?? body.decisionType, body.dppReference, body.reason].filter(Boolean).join(' · ')}</span>
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
