import { answerPrisonInvite, importPrisonPackage, listPrisonLinks, listPrisonReports, pickPackage, savePackage, type PrisonLink, type PrisonReport } from '@/features/exchange/data'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { useCallback, useEffect, useState } from 'react'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const status = (s: string) => (s === 'trusted' ? m['prison.status_trusted']() : s === 'declined' ? m['prison.status_declined']() : s === 'revoked' ? m['prison.status_revoked']() : m['prison.status_answered']())

/** The prisons that invited this registry: answer an invitation, read their
 * confirmation. Orders are sent from the order itself. */
export function PrisonLinks() {
  const [links, setLinks] = useState<PrisonLink[]>([])
  const [reports, setReports] = useState<PrisonReport[]>([])
  const [contact, setContact] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => {
    setLinks(await listPrisonLinks())
    setReports(await listPrisonReports())
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
    <Card>
      <CardHeader>
        <CardTitle>{m['prison.title']()}</CardTitle>
        <CardDescription>{m['prison.desc']()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
        <div className="flex flex-wrap gap-2">
          <Input aria-label={m['prison.contact']()} placeholder={m['prison.contact']()} value={contact} onChange={(e) => setContact(e.target.value)} className="w-full sm:w-64" />
          <Button
            onClick={() =>
              run(async () => {
                const invite = await pickPackage()
                if (!invite) return
                const answer = await answerPrisonInvite(invite, contact)
                if (await savePackage(answer)) return m['prison.answered_notice']({ prison: answer.prisonName })
              })
            }
          >
            {m['prison.open_invite']()}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                const file = await pickPackage()
                if (file) return (await importPrisonPackage(file)).message
              })
            }
          >
            {m['prison.open_file']()}
          </Button>
        </div>
        {links.length === 0 ? <p className="text-muted-foreground">{m['prison.none']()}</p> : links.map((l) => (
          <div key={l.id} className="flex flex-col gap-1 border-t border-border/60 pt-3">
            <span className="flex flex-wrap items-center gap-2">
              {l.prisonName}
              <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{status(l.status)}</Badge>
            </span>
            {l.status === 'answered' && <span className="text-muted-foreground">{m['prison.read_code']({ code: l.fingerprint })}</span>}
            {l.reason && <span className="text-muted-foreground">{l.reason}</span>}
          </div>
        ))}
        {reports.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <p className="font-medium">{m["prison.reports_title"]()}</p>
            {reports.map((r) => (
              <p key={r.id} className="text-muted-foreground">
                {m["prison.report_line"]({ prison: r.prisonName, accused: r.accused, number: r.courtNumber, event: m[`prison.event_${r.event}` as "prison.event_other"]() })}{r.note ? ` · ${r.note}` : ""}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
