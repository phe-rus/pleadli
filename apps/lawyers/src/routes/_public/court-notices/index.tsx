import { zoneFor } from '@pleadli/ui/lib/institution-zone'
import { createIdentity, createInvite, fileNotice, getIdentity, importPackage, listIncoming, listLinks, listOpenMatters, pickPackage, returnNotice, savePackage, revokeLink, trustLink, type CourtLink, type FirmIdentity, type IncomingNotice, type MatterOption, type NoticeClaim } from '@/features/court-notices/data'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, Link as RouterLink } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/court-notices/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const linkStatus = (s: string) => (s === 'trusted' ? m['court_notices.status_trusted']() : s === 'awaiting_confirmation' ? m['court_notices.status_awaiting']() : s === 'declined' ? m['court_notices.status_declined']() : s === 'revoked' ? m['court_notices.status_revoked']() : m['court_notices.status_invited']())
const parse = (payload: string): NoticeClaim => {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}
const normal = (s: string | null | undefined) => (s ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: zoneFor(ms) })

/** Court notices arriving as files: read as claims, filed by a person against
 * the matter they belong to, answered with a receipt. */
function RouteComponent() {
  const [identity, setIdentity] = useState<FirmIdentity | null | undefined>(undefined)
  const [links, setLinks] = useState<CourtLink[]>([])
  const [notices, setNotices] = useState<IncomingNotice[]>([])
  const [matters, setMatters] = useState<MatterOption[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [court, setCourt] = useState('')
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [endReasons, setEndReasons] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [by, setBy] = useState('')

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (!id) return
    setLinks(await listLinks())
    setNotices(await listIncoming())
    setMatters(await listOpenMatters())
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
          <h1>{m['court_notices.title']()}</h1>
          <p className="text-muted-foreground">{m['court_notices.intro']()}</p>
        </div>
      </header>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && (
          <p role="status" className={notice.error ? 'text-destructive' : undefined}>
            {notice.text}
          </p>
        )}

        {identity === null && (
          <Card>
            <CardHeader>
              <CardTitle>{m['court_notices.identity_title']()}</CardTitle>
              <CardDescription>{m['court_notices.identity_desc']()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input aria-label={m['court_notices.firm_name']()} placeholder={m['court_notices.firm_name']()} value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:w-72" />
              <Input aria-label={m['court_notices.area']()} placeholder={m['court_notices.area']()} value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-48" />
              <Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>
                {m['court_notices.create_identity']()}
              </Button>
            </CardContent>
          </Card>
        )}

        {identity && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{identity.officeName}</CardTitle>
                <CardDescription>{m['court_notices.fingerprint']({ code: identity.fingerprint })}</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m['court_notices.courts']()}</CardTitle>
                <CardDescription>{m['court_notices.courts_desc']()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Input aria-label={m['court_notices.court_ph']()} placeholder={m['court_notices.court_ph']()} value={court} onChange={(e) => setCourt(e.target.value)} className="w-full sm:w-72" />
                  <Button
                    disabled={!court.trim()}
                    onClick={() =>
                      run(async () => {
                        const invite = await createInvite(court, 14)
                        await load()
                        if (await savePackage(invite)) return m['court_notices.invite_saved']({ court })
                      })
                    }
                  >
                    {m['court_notices.invite']()}
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
                    {m['court_notices.open_file']()}
                  </Button>
                </div>
                {links.length === 0 ? (
                  <p className="text-muted-foreground">{m['court_notices.none_courts']()}</p>
                ) : (
                  links.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <span className="flex items-center gap-2">
                        {l.courtName ?? l.intendedCourt}
                        <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{linkStatus(l.status)}</Badge>
                      </span>
                      {l.status === 'awaiting_confirmation' && (
                        <span className="flex flex-wrap items-center gap-2">
                          <Input aria-label={m['court_notices.code_ph']()} placeholder={m['court_notices.code_ph']()} value={codes[l.id] ?? ''} onChange={(e) => setCodes({ ...codes, [l.id]: e.target.value })} className="w-60 font-mono" />
                          <Button
                            size="sm"
                            disabled={!(codes[l.id] ?? '').trim()}
                            onClick={() =>
                              run(async () => {
                                const c = await trustLink(l.id, codes[l.id] ?? '')
                                await load()
                                if (await savePackage(c)) return m['court_notices.confirmed']({ court: l.courtName ?? '' })
                              })
                            }
                          >
                            {m['court_notices.confirm']()}
                          </Button>
                        </span>
                      )}

                      {l.status === 'trusted' && (
                        <span className="flex flex-wrap items-center gap-2">
                          <Input aria-label={m['court_notices.end_ph']()} placeholder={m['court_notices.end_ph']()} value={endReasons[l.id] ?? ''} onChange={(e) => setEndReasons({ ...endReasons, [l.id]: e.target.value })} className="w-60" />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!(endReasons[l.id] ?? '').trim()}
                            onClick={() =>
                              run(async () => {
                                const c = await revokeLink(l.id, endReasons[l.id] ?? '')
                                await load()
                                if (await savePackage(c)) return m['court_notices.ended']({ name: l.courtName ?? l.intendedCourt })
                              })
                            }
                          >
                            {m['court_notices.end']()}
                          </Button>
                        </span>
                      )}
                      {l.status === 'revoked' && l.revokedReason && <span className="text-muted-foreground">{m['court_notices.ended_reason']({ reason: l.revokedReason })}</span>}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m['court_notices.notices']()}</CardTitle>
                <CardDescription>{m['court_notices.notices_desc']()}</CardDescription>
                <div className="pt-2">
                  <Input aria-label={m['court_notices.by_ph']()} placeholder={m['court_notices.by_ph']()} value={by} onChange={(e) => setBy(e.target.value)} className="w-full sm:w-72" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {notices.length === 0 ? (
                  <p className="text-muted-foreground">{m['court_notices.none_notices']()}</p>
                ) : (
                  notices.map((n) => {
                    const c = parse(n.payload)
                    // Offer the matters on this case first, never choose one for the person.
                    const options = [...matters].sort((a, b) => Number(normal(b.courtNumber) === normal(c.courtNumber)) - Number(normal(a.courtNumber) === normal(c.courtNumber)))
                    return (
                      <div key={n.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {c.kind === 'order' ? m['court_notices.kind_order']() : m['court_notices.kind_hearing']()} <span className="text-muted-foreground">· {n.courtName}</span>
                          </span>
                          <Badge variant={n.status === 'filed' ? 'default' : 'secondary'}>{n.status === 'received' ? m['court_notices.waiting']() : n.status === 'filed' ? m['court_notices.filed']() : m['court_notices.returned']()}</Badge>
                        </div>
                        <p>{m['court_notices.case_line']({ number: c.courtNumber ?? '', title: c.caseTitle ?? '' })}</p>
                        {c.at && <p className="text-muted-foreground">{m['court_notices.at_line']({ date: when(c.at) })}{c.purpose ? ` · ${m['court_notices.purpose_line']({ purpose: c.purpose })}` : ''}{c.courtroom ? ` · ${m['court_notices.room_line']({ room: c.courtroom })}` : ''}</p>}
                        <div className="flex flex-col gap-1 text-muted-foreground">
                          {c.kind === 'order' && c.title && <p className="font-medium text-foreground">{c.title}</p>}
                          {(c.paragraphs ?? []).map((p, i) => (
                            <p key={i}>{p}</p>
                          ))}
                        </div>
                        {n.returnReason && <p className="text-muted-foreground">{m['court_notices.returned_reason']({ reason: n.returnReason })}</p>}
                        {n.status === 'filed' && n.matterId && (
                          <RouterLink to="/matters/$matterId" params={{ matterId: n.matterId }} className="w-fit text-primary hover:underline">
                            {m['court_notices.open_matter']()}
                          </RouterLink>
                        )}
                        {n.status === 'received' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select aria-label={m['court_notices.matter_ph']()} value={chosen[n.id] ?? ''} onChange={(e) => setChosen({ ...chosen, [n.id]: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 sm:w-72">
                              <option value="">{m['court_notices.matter_ph']()}</option>
                              {options.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.title}
                                  {x.courtNumber ? ` · ${x.courtNumber}` : ''}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              disabled={!chosen[n.id] || !by.trim()}
                              onClick={() =>
                                run(async () => {
                                  const r = await fileNotice(n.id, chosen[n.id] ?? '', by)
                                  if (await savePackage(r)) return m['court_notices.filed_notice']()
                                })
                              }
                            >
                              {m['court_notices.file_button']()}
                            </Button>
                            <Input aria-label={m['court_notices.reason_ph']()} placeholder={m['court_notices.reason_ph']()} value={reasons[n.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [n.id]: e.target.value })} className="w-56" />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!(reasons[n.id] ?? '').trim() || !by.trim()}
                              onClick={() =>
                                run(async () => {
                                  const r = await returnNotice(n.id, reasons[n.id] ?? '', by)
                                  if (await savePackage(r)) return m['court_notices.returned_notice']()
                                })
                              }
                            >
                              {m['court_notices.return_button']()}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </article>
  )
}
