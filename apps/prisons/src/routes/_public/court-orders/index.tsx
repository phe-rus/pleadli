import { zoneFor } from '@pleadli/ui/lib/institution-zone'
import { createIdentity, createInvite, getIdentity, importPackage, listLinks, listOrders, listPrisoners, pickPackage, recordOrder, reportToCourt, returnOrder, savePackage, trustLink, type CourtLink, type FacilityIdentity, type IncomingOrder, type OrderClaim, type PrisonerOption } from '@/features/court-orders/data'
import { m } from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/court-orders/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const linkStatus = (s: string) => (s === 'trusted' ? m.court_orders_status_trusted() : s === 'awaiting_confirmation' ? m.court_orders_status_awaiting() : s === 'declined' ? m.court_orders_status_declined() : m.court_orders_status_invited())
const parse = (payload: string): OrderClaim => {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}
const shortDate = (ms: number) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: zoneFor(ms) })

/** Court orders arriving as files: read as claims, recorded by a person against
 * the prisoner they are about, answered with a receipt. */
function RouteComponent() {
  const [identity, setIdentity] = useState<FacilityIdentity | null | undefined>(undefined)
  const [links, setLinks] = useState<CourtLink[]>([])
  const [orders, setOrders] = useState<IncomingOrder[]>([])
  const [prisoners, setPrisoners] = useState<Record<string, PrisonerOption[]>>({})
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [court, setCourt] = useState('')
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const id = await getIdentity()
    setIdentity(id)
    if (!id) return
    setLinks(await listLinks())
    const incoming = await listOrders()
    setOrders(incoming)
    // Offer the prisoners whose names match what the court wrote, never guess one.
    const found: Record<string, PrisonerOption[]> = {}
    for (const o of incoming.filter((x) => x.status === 'received')) found[o.id] = await listPrisoners((parse(o.payload).accused ?? '').split(' ').pop() ?? '')
    setPrisoners(found)
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
          <h1>{m.court_orders_title()}</h1>
          <p className="text-muted-foreground">{m.court_orders_intro()}</p>
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
              <CardTitle>{m.court_orders_identity_title()}</CardTitle>
              <CardDescription>{m.court_orders_identity_desc()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input aria-label={m.court_orders_facility_name()} placeholder={m.court_orders_facility_name()} value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:w-72" />
              <Input aria-label={m.court_orders_area()} placeholder={m.court_orders_area()} value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-48" />
              <Button disabled={!name.trim()} onClick={() => run(async () => void (await createIdentity(name, area)))}>
                {m.court_orders_create_identity()}
              </Button>
            </CardContent>
          </Card>
        )}

        {identity && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{identity.facilityName}</CardTitle>
                <CardDescription>{m.court_orders_fingerprint({ code: identity.fingerprint })}</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m.court_orders_courts()}</CardTitle>
                <CardDescription>{m.court_orders_courts_desc()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Input aria-label={m.court_orders_court_ph()} placeholder={m.court_orders_court_ph()} value={court} onChange={(e) => setCourt(e.target.value)} className="w-full sm:w-72" />
                  <Button
                    disabled={!court.trim()}
                    onClick={() =>
                      run(async () => {
                        const invite = await createInvite(court, 14)
                        if (await savePackage(invite)) return m.court_orders_invite_saved({ court })
                      })
                    }
                  >
                    {m.court_orders_invite()}
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
                    {m.court_orders_open_file()}
                  </Button>
                </div>
                {links.length === 0 ? (
                  <p className="text-muted-foreground">{m.court_orders_none_courts()}</p>
                ) : (
                  links.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <span className="flex items-center gap-2">
                        {l.courtName ?? l.intendedCourt}
                        <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{linkStatus(l.status)}</Badge>
                      </span>
                      {l.status === 'awaiting_confirmation' && (
                        <span className="flex flex-wrap items-center gap-2">
                          <Input aria-label={m.court_orders_code_ph()} placeholder={m.court_orders_code_ph()} value={codes[l.id] ?? ''} onChange={(e) => setCodes({ ...codes, [l.id]: e.target.value })} className="w-60 font-mono" />
                          <Button
                            size="sm"
                            disabled={!(codes[l.id] ?? '').trim()}
                            onClick={() =>
                              run(async () => {
                                const c = await trustLink(l.id, codes[l.id] ?? '')
                                if (await savePackage(c)) return m.court_orders_confirmed({ court: l.courtName ?? '' })
                              })
                            }
                          >
                            {m.court_orders_confirm()}
                          </Button>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m.court_orders_orders()}</CardTitle>
                <CardDescription>{m.court_orders_orders_desc()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {orders.length === 0 ? (
                  <p className="text-muted-foreground">{m.court_orders_none_orders()}</p>
                ) : (
                  orders.map((o) => {
                    const c = parse(o.payload)
                    return (
                      <div key={o.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {c.kind === 'release' ? m.court_orders_kind_release() : m.court_orders_kind_remand()} <span className="text-muted-foreground">· {c.courtNumber} · {o.courtName} · {shortDate(o.receivedAt)}</span>
                          </span>
                          <Badge variant={o.status === 'recorded' ? 'default' : 'secondary'}>{o.status === 'received' ? m.court_orders_waiting() : o.status === 'recorded' ? m.court_orders_recorded() : m.court_orders_returned()}</Badge>
                        </div>
                        <p>{m.court_orders_accused_named({ name: c.accused ?? '' })}</p>
                        {c.prison && <p className="text-muted-foreground">{m.court_orders_held_at({ place: c.prison })}</p>}
                        {c.remandUntil && <p className="text-muted-foreground">{m.court_orders_remand_until({ date: shortDate(c.remandUntil) })}</p>}
                        <div className="flex flex-col gap-1 text-muted-foreground">
                          {(c.paragraphs ?? []).map((p, i) => (
                            <p key={i}>{p}</p>
                          ))}
                        </div>
                        {o.reason && <p className="text-muted-foreground">{m.court_orders_returned_reason({ reason: o.reason })}</p>}
                        {o.status === 'received' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select aria-label={m.court_orders_prisoner_ph()} value={chosen[o.id] ?? ''} onChange={(e) => setChosen({ ...chosen, [o.id]: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 sm:w-64">
                              <option value="">{m.court_orders_prisoner_ph()}</option>
                              {(prisoners[o.id] ?? []).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.firstName} {p.lastName}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              disabled={!chosen[o.id]}
                              onClick={() =>
                                run(async () => {
                                  const r = await recordOrder(o.id, chosen[o.id] ?? '')
                                  if (await savePackage(r)) return m.court_orders_recorded_notice()
                                })
                              }
                            >
                              {m.court_orders_record()}
                            </Button>
                            <Input aria-label={m.court_orders_reason_ph()} placeholder={m.court_orders_reason_ph()} value={reasons[o.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [o.id]: e.target.value })} className="w-56" />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!(reasons[o.id] ?? '').trim()}
                              onClick={() =>
                                run(async () => {
                                  const r = await returnOrder(o.id, reasons[o.id] ?? '')
                                  if (await savePackage(r)) return m.court_orders_returned_notice()
                                })
                              }
                            >
                              {m.court_orders_return_button()}
                            </Button>
                          </div>
                        )}
                        {o.status === 'recorded' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select aria-label={m.court_orders_report_event()} value={events[o.id] ?? ''} onChange={(e) => setEvents({ ...events, [o.id]: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2">
                              <option value="">{m.court_orders_report_event()}</option>
                              {(['released', 'transferred', 'hospitalised', 'died', 'escaped', 'not_produced', 'other'] as const).map((ev) => <option key={ev} value={ev}>{m[`court_orders_event_${ev}` as const]()}</option>)}
                            </select>
                            <Input aria-label={m.court_orders_report_note()} placeholder={m.court_orders_report_note()} value={notes[o.id] ?? ''} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} className="w-56" />
                            <Button size="sm" variant="secondary" disabled={!events[o.id]} onClick={() => run(async () => { const r = await reportToCourt(o.id, events[o.id] ?? '', notes[o.id] ?? ''); if (await savePackage(r)) return m.court_orders_report_notice() })}>{m.court_orders_report_button()}</Button>
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
