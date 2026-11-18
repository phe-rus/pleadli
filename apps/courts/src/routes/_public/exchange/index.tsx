import { acceptFiling, recordWithdrawal, createIdentity, createInvite, getIdentity, importPackage, listIncoming, listLinks, pickPackage, rejectFiling, savePackage, trustLink, type Incoming, type Link, type RegistryIdentity } from '@/features/exchange/data'
import * as m from "@/paraglide/messages"
import { PrisonLinks } from "@/features/exchange/prison-links"
import { FirmLinks } from "@/features/exchange/firm-links"
import { FirmFilings } from "@/features/exchange/firm-filings"
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, Link as RouterLink } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/exchange/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const STATUS = (s: string) => (s === "trusted" ? m["exchange.status_trusted"]() : s === "awaiting_confirmation" ? m["exchange.status_awaiting"]() : s === "declined" ? m["exchange.status_declined"]() : s === "revoked" ? m["exchange.status_revoked"]() : m["exchange.status_invited"]())
const ROLE = (r: string) => (r === "accused" ? m["exchange.role_accused"]() : r === "complainant" ? m["exchange.role_complainant"]() : r === "witness" ? m["exchange.role_witness"]() : r)

type Filing = { title?: string; dppFileKey?: string; dppReference?: string; policeReference?: string; courtLevel?: string; parties?: { role: string; name: string; custody?: string }[]; charges?: { offence: string; statutorySection?: string }[] }
const parse = (payload: string): Filing => {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

function RouteComponent() {
  const [identity, setIdentity] = useState<RegistryIdentity | null | undefined>(undefined)
  const [links, setLinks] = useState<Link[]>([])
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [office, setOffice] = useState('')
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [by, setBy] = useState('')

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (id) {
      setLinks(await listLinks())
      setIncoming(await listIncoming())
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

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["exchange.title"]()}</h1>
          <p className="text-muted-foreground">{m["exchange.intro"]()}</p>
        </div>
      </header>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        {identity === null && (
          <Card>
            <CardHeader>
              <CardTitle>{m["exchange.identity_title"]()}</CardTitle>
              <CardDescription>{m["exchange.identity_desc"]()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input aria-label={m["exchange.registry_name"]()} placeholder={m["exchange.registry_name"]()} value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:w-72" />
              <Input aria-label={m["exchange.area"]()} placeholder={m["exchange.area"]()} value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-48" />
              <Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>{m["exchange.create_identity"]()}</Button>
            </CardContent>
          </Card>
        )}

        {identity && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{identity.officeName}</CardTitle>
                <CardDescription>
                  {m["exchange.fingerprint"]({ code: identity.fingerprint })}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m["exchange.offices"]()}</CardTitle>
                <CardDescription>{m["exchange.offices_desc"]()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Input aria-label={m["exchange.office_ph"]()} placeholder={m["exchange.office_ph"]()} value={office} onChange={(e) => setOffice(e.target.value)} className="w-full sm:w-72" />
                  <Button
                    disabled={!office.trim()}
                    onClick={() =>
                      run(async () => {
                        const invite = await createInvite(office, 14)
                        if (await savePackage(invite)) return m["exchange.invite_saved"]({ office })
                      })
                    }
                  >{m["exchange.invite"]()}</Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(async () => {
                        const file = await pickPackage()
                        if (file) return (await importPackage(file)).message
                      })
                    }
                  >{m["exchange.open_file"]()}</Button>
                </div>
                {links.length === 0 ? <p className="text-muted-foreground">{m["exchange.none_offices"]()}</p> : links.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="flex items-center gap-2">
                      {l.dppName ?? l.intendedOffice}
                      <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{STATUS(l.status)}</Badge>
                    </span>
                    {l.status === 'awaiting_confirmation' && (
                      <span className="flex flex-wrap items-center gap-2">
                        <Input aria-label={m["exchange.code_ph"]()} placeholder={m["exchange.code_ph"]()} value={codes[l.id] ?? ''} onChange={(e) => setCodes({ ...codes, [l.id]: e.target.value })} className="w-60 font-mono" />
                        <Button size="sm" disabled={!(codes[l.id] ?? '').trim()} onClick={() => run(async () => { const c = await trustLink(l.id, codes[l.id] ?? ''); if (await savePackage(c)) return m["exchange.confirmed"]({ office: l.dppName ?? "" }) })}>
{m["exchange.confirm"]()}
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m["exchange.filings"]()}</CardTitle>
                <CardDescription>{m["exchange.filings_desc"]()}</CardDescription>
                <div className="pt-2"><Input aria-label={m["exchange.by_ph"]()} placeholder={m["exchange.by_ph"]()} value={by} onChange={(e) => setBy(e.target.value)} className="w-full sm:w-72" /></div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {incoming.length === 0 ? <p className="text-muted-foreground">{m["exchange.none_filings"]()}</p> : incoming.map((i) => {
                  if (i.kind === 'case_withdrawal') {
                    const w = JSON.parse(i.payload) as { courtNumber: string; decision: string; reason: string | null }
                    return (
                      <div key={i.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{m['exchange.withdrawal_title']({ number: w.courtNumber })} <span className="text-muted-foreground">· {i.dppName} · {format(i.receivedAt, 'd MMM yyyy')}</span></span>
                          <Badge variant={i.status === 'accepted' ? 'default' : 'secondary'}>{i.status === 'received' ? m['exchange.waiting']() : m['exchange.withdrawal_recorded']()}</Badge>
                        </div>
                        <p className="text-muted-foreground">{[w.decision === 'nolle_prosequi' ? m['exchange.nolle']() : m['exchange.discontinued'](), w.reason].filter(Boolean).join(' · ')}</p>
                        {i.status === 'accepted' && i.caseId && <RouterLink to="/cases/$caseId" params={{ caseId: i.caseId }} className="w-fit text-primary hover:underline">{m['exchange.open_case']()}</RouterLink>}
                        {i.status === 'received' && <div><Button size="sm" disabled={!by.trim()} onClick={() => run(async () => { const r = await recordWithdrawal(i.id, by); if (await savePackage(r)) return m['exchange.withdrawal_notice']() })}>{m['exchange.record_withdrawal']()}</Button></div>}
                      </div>
                    )
                  }
                  const f = parse(i.payload)
                  return (
                    <div key={i.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{f.title} <span className="text-muted-foreground">· {i.dppName} · {format(i.receivedAt, 'd MMM yyyy')}</span></span>
                        <Badge variant={i.status === 'accepted' ? 'default' : 'secondary'}>{i.status === "received" ? m["exchange.waiting"]() : i.status === "accepted" ? m["exchange.registered"]() : m["exchange.returned"]()}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {[f.dppReference && m["exchange.dpp"]({ reference: f.dppReference }), f.policeReference && m["exchange.police"]({ reference: f.policeReference }), f.courtLevel === "high" ? m["exchange.high_court"]() : m["exchange.magistrates_court"]()].filter(Boolean).join(' · ')}
                      </p>
                      <p>{(f.parties ?? []).map((p) => `${p.name} (${ROLE(p.role)})`).join(', ')}</p>
                      <p>{(f.charges ?? []).map((c) => [c.offence, c.statutorySection].filter(Boolean).join(', ')).join('; ')}</p>
                      {i.rejectReason && <p className="text-muted-foreground">{m["exchange.returned_reason"]({ reason: i.rejectReason })}</p>}
                      {i.status === 'accepted' && i.caseId && <RouterLink to="/cases/$caseId" params={{ caseId: i.caseId }} className="w-fit text-primary hover:underline">{m["exchange.open_case"]()}</RouterLink>}
                      {i.status === 'received' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input aria-label={m["exchange.court_number_ph"]()} placeholder={m["exchange.court_number_ph"]()} value={numbers[i.id] ?? ''} onChange={(e) => setNumbers({ ...numbers, [i.id]: e.target.value })} className="w-60" />
                          <Button size="sm" disabled={!(numbers[i.id] ?? '').trim() || !by.trim()} onClick={() => run(async () => { const r = await acceptFiling(i.id, numbers[i.id] ?? '', by); if (await savePackage(r)) return m["exchange.registered_notice"]({ number: numbers[i.id] ?? "" }) })}>{m["exchange.register"]()}</Button>
                          <Input aria-label={m["exchange.reason_ph"]()} placeholder={m["exchange.reason_ph"]()} value={reasons[i.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} className="w-56" />
                          <Button size="sm" variant="secondary" disabled={!(reasons[i.id] ?? '').trim() || !by.trim()} onClick={() => run(async () => { const r = await rejectFiling(i.id, reasons[i.id] ?? '', by); if (await savePackage(r)) return 'Returned. Send the receipt back.' })}>{m["exchange.return_button"]()}</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
            <PrisonLinks />
            <FirmLinks />
            <FirmFilings />
          </>
        )}
      </div>
    </article>
  )
}
