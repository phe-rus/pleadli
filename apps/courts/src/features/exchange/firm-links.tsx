import { answerFirmInvite, importFirmPackage, listFirmLinks, pickPackage, savePackage, type FirmLink } from '@/features/exchange/data'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { useCallback, useEffect, useState } from 'react'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const status = (s: string) => (s === 'trusted' ? m['firm.status_trusted']() : s === 'declined' ? m['firm.status_declined']() : s === 'revoked' ? m['firm.status_revoked']() : m['firm.status_answered']())

/** The prisons that invited this registry: answer an invitation, read their
 * confirmation. Orders are sent from the order itself. */
export function FirmLinks() {
  const [links, setLinks] = useState<FirmLink[]>([])
  const [contact, setContact] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => setLinks(await listFirmLinks()), [])
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
        <CardTitle>{m['firm.title']()}</CardTitle>
        <CardDescription>{m['firm.desc']()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
        <div className="flex flex-wrap gap-2">
          <Input aria-label={m['firm.contact']()} placeholder={m['firm.contact']()} value={contact} onChange={(e) => setContact(e.target.value)} className="w-full sm:w-64" />
          <Button
            onClick={() =>
              run(async () => {
                const invite = await pickPackage()
                if (!invite) return
                const answer = await answerFirmInvite(invite, contact)
                if (await savePackage(answer)) return m['firm.answered_notice']({ firm: answer.firmName })
              })
            }
          >
            {m['firm.open_invite']()}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                const file = await pickPackage()
                if (file) return (await importFirmPackage(file)).message
              })
            }
          >
            {m['firm.open_file']()}
          </Button>
        </div>
        {links.length === 0 ? <p className="text-muted-foreground">{m['firm.none']()}</p> : links.map((l) => (
          <div key={l.id} className="flex flex-col gap-1 border-t border-border/60 pt-3">
            <span className="flex flex-wrap items-center gap-2">
              {l.firmName}
              <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{status(l.status)}</Badge>
            </span>
            {l.status === 'answered' && <span className="text-muted-foreground">{m['firm.read_code']({ code: l.fingerprint })}</span>}
            {l.reason && <span className="text-muted-foreground">{l.reason}</span>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
