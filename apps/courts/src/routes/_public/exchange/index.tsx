import { acceptFiling, createIdentity, createInvite, getIdentity, importPackage, listIncoming, listLinks, pickPackage, rejectFiling, savePackage, trustLink, type Incoming, type Link, type RegistryIdentity } from '@/features/exchange/data'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, Link as RouterLink } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/exchange/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const STATUS: Record<string, string> = { invited: 'Waiting for the office', awaiting_confirmation: 'Answered, confirm it', trusted: 'Trusted', declined: 'Declined', revoked: 'Ended' }

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
          <h1>DPP filings</h1>
          <p className="text-muted-foreground">Receive prosecution files from a DPP office as sealed files, register them with the court's own number, and send the receipt back. Everything works with no internet.</p>
        </div>
      </header>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        {identity === null && (
          <Card>
            <CardHeader>
              <CardTitle>This registry</CardTitle>
              <CardDescription>Give the registry its identity once, as the DPP offices that file to it know it. It cannot be changed afterwards.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input aria-label="Registry name" placeholder="Registry name" value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:w-72" />
              <Input aria-label="Area" placeholder="Area" value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-48" />
              <Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>Create identity</Button>
            </CardContent>
          </Card>
        )}

        {identity && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{identity.officeName}</CardTitle>
                <CardDescription>
                  Fingerprint <span className="font-mono">{identity.fingerprint}</span>
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>DPP offices</CardTitle>
                <CardDescription>Invite an office with a file. It answers, you confirm its fingerprint by typing what it reads out, and only then can it file here.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Input aria-label="DPP office" placeholder="DPP office to invite" value={office} onChange={(e) => setOffice(e.target.value)} className="w-full sm:w-72" />
                  <Button
                    disabled={!office.trim()}
                    onClick={() =>
                      run(async () => {
                        const invite = await createInvite(office, 14)
                        if (await savePackage(invite)) return `Invitation saved for ${office}. Send it to them.`
                      })
                    }
                  >
                    Invite
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(async () => {
                        const file = await pickPackage()
                        if (file) return (await importPackage(file)).message
                      })
                    }
                  >
                    Open a file from the office
                  </Button>
                </div>
                {links.length === 0 ? <p className="text-muted-foreground">No office has been invited yet.</p> : links.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="flex items-center gap-2">
                      {l.dppName ?? l.intendedOffice}
                      <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{STATUS[l.status] ?? l.status}</Badge>
                    </span>
                    {l.status === 'awaiting_confirmation' && (
                      <span className="flex flex-wrap items-center gap-2">
                        <Input aria-label="Code the office read out" placeholder="Code the office read out" value={codes[l.id] ?? ''} onChange={(e) => setCodes({ ...codes, [l.id]: e.target.value })} className="w-60 font-mono" />
                        <Button size="sm" disabled={!(codes[l.id] ?? '').trim()} onClick={() => run(async () => { const c = await trustLink(l.id, codes[l.id] ?? ''); if (await savePackage(c)) return `${l.dppName} is confirmed. Send it the confirmation file.` })}>
                          Confirm
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Filings</CardTitle>
                <CardDescription>A filing is held here until a person reads it and registers it. Nothing enters the register by itself.</CardDescription>
                <div className="pt-2"><Input aria-label="Your name" placeholder="Your name, for the record" value={by} onChange={(e) => setBy(e.target.value)} className="w-full sm:w-72" /></div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {incoming.length === 0 ? <p className="text-muted-foreground">No filing has arrived yet.</p> : incoming.map((i) => {
                  const f = parse(i.payload)
                  return (
                    <div key={i.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{f.title} <span className="text-muted-foreground">· {i.dppName} · {format(i.receivedAt, 'd MMM yyyy')}</span></span>
                        <Badge variant={i.status === 'accepted' ? 'default' : 'secondary'}>{i.status === 'received' ? 'Waiting' : i.status === 'accepted' ? 'Registered' : 'Returned'}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {[f.dppReference && `DPP ${f.dppReference}`, f.policeReference && `Police ${f.policeReference}`, f.courtLevel === 'high' ? 'High Court' : 'Magistrates court'].filter(Boolean).join(' · ')}
                      </p>
                      <p>{(f.parties ?? []).map((p) => `${p.name} (${p.role})`).join(', ')}</p>
                      <p>{(f.charges ?? []).map((c) => [c.offence, c.statutorySection].filter(Boolean).join(', ')).join('; ')}</p>
                      {i.rejectReason && <p className="text-muted-foreground">Returned: {i.rejectReason}</p>}
                      {i.status === 'accepted' && i.caseId && <RouterLink to="/cases/$caseId" params={{ caseId: i.caseId }} className="w-fit text-primary hover:underline">Open the case</RouterLink>}
                      {i.status === 'received' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input aria-label="Court number" placeholder="Court number, e.g. CO 12/2026" value={numbers[i.id] ?? ''} onChange={(e) => setNumbers({ ...numbers, [i.id]: e.target.value })} className="w-60" />
                          <Button size="sm" disabled={!(numbers[i.id] ?? '').trim() || !by.trim()} onClick={() => run(async () => { const r = await acceptFiling(i.id, numbers[i.id] ?? '', by); if (await savePackage(r)) return `Registered as ${numbers[i.id]}. Send the receipt back.` })}>Register</Button>
                          <Input aria-label="Reason" placeholder="Reason, to return it" value={reasons[i.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} className="w-56" />
                          <Button size="sm" variant="secondary" disabled={!(reasons[i.id] ?? '').trim() || !by.trim()} onClick={() => run(async () => { const r = await rejectFiling(i.id, reasons[i.id] ?? '', by); if (await savePackage(r)) return 'Returned. Send the receipt back.' })}>Return</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </article>
  )
}
