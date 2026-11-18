import { ownFingerprint, answerInvite, fileToCourt, importCourtPackage, listCourtLinks, pickCourtPackage, saveCourtPackage, type CourtLink } from '@/features/court-exchange/data'
import { listFiles } from '@/features/prosecution-files/data'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import * as m from "@/paraglide/messages"
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/courts/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const status = (s: string) => (s === "trusted" ? m["court_exchange.status_trusted"]() : s === "declined" ? m["court_exchange.status_declined"]() : m["court_exchange.status_answered"]())

/** Filing to a court: answer a registry's invitation, send it a prosecution file
 * as a sealed file, and take back the receipt that carries the court's number. */

function RouteComponent() {
  const [links, setLinks] = useState<CourtLink[]>([])
  const [files, setFiles] = useState<{ id: string; title: string; odppRegistrationNumber: string | null; courtCaseNumber: string | null }[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [contact, setContact] = useState('')
  const [fileId, setFileId] = useState('')
  const [level, setLevel] = useState<'magistrate' | 'high'>('magistrate')
  const [by, setBy] = useState('')

  const [own, setOwn] = useState<string | null>(null)
  const load = useCallback(async () => {
    setOwn(await ownFingerprint())
    setLinks(await listCourtLinks())
    setFiles(await listFiles('all'))
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
  const trusted = links.find((l) => l.status === 'trusted')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["court_exchange.title"]()}</h1>
          <p className="text-muted-foreground">{m["court_exchange.intro"]()}</p>
        </div>
      </header>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        <Card>
          <CardHeader>
            <CardTitle>{m["court_exchange.registries"]()}</CardTitle>
            <CardDescription>{m["court_exchange.registries_desc"]()}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Input aria-label={m["court_exchange.contact"]()} placeholder={m["court_exchange.contact"]()} value={contact} onChange={(e) => setContact(e.target.value)} className="w-full sm:w-64" />
              <Button
                onClick={() =>
                  run(async () => {
                    const invite = await pickCourtPackage()
                    if (!invite) return
                    const answer = await answerInvite(invite, contact)
                    if (await saveCourtPackage(answer)) return m["court_exchange.answered_notice"]({ court: answer.courtName })
                  })
                }
              >{m["court_exchange.open_invite"]()}</Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    const file = await pickCourtPackage()
                    if (file) return (await importCourtPackage(file)).message
                  })
                }
              >{m["court_exchange.open_court_file"]()}</Button>
            </div>
            {links.length === 0 ? <p className="text-muted-foreground">{m["court_exchange.none"]()}</p> : links.map((l) => (
              <div key={l.id} className="flex flex-col gap-1 border-t border-border/60 pt-3">
                <span className="flex flex-wrap items-center gap-2">
                  {l.courtName}
                  <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{status(l.status)}</Badge>
                </span>
                {l.status === "answered" && (
                  <>
                    <span className="text-muted-foreground">{m["court_exchange.read_code"]()} <span className="font-mono text-foreground">{own}</span></span>
                    <span className="text-muted-foreground">{m["court_exchange.check_code"]()} <span className="font-mono text-foreground">{l.fingerprint}</span></span>
                  </>
                )}
                {l.reason && <span className="text-muted-foreground">{l.reason}</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{trusted ? m["court_exchange.file_to"]({ court: trusted.courtName }) : m["court_exchange.file_to_a_court"]()}</CardTitle>
            <CardDescription>{trusted ? m["court_exchange.file_ready"]() : m["court_exchange.file_wait"]()}</CardDescription>
          </CardHeader>
          {trusted && (
            <CardContent className="flex flex-wrap items-center gap-2">
              <select aria-label={m["court_exchange.prosecution_file"]()} value={fileId} onChange={(e) => setFileId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 sm:w-80">
                <option value="">{m["court_exchange.choose_file"]()}</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>{f.title}{f.courtCaseNumber ? ` · ${f.courtCaseNumber}` : ''}</option>
                ))}
              </select>
              <select aria-label={m["court_exchange.court_level"]()} value={level} onChange={(e) => setLevel(e.target.value as 'magistrate' | 'high')} className="h-9 rounded-md border border-input bg-background px-2">
                <option value="magistrate">{m["court_exchange.level_magistrate"]()}</option>
                <option value="high">{m["court_exchange.level_high"]()}</option>
              </select>
              <Input aria-label={m["court_exchange.filed_by"]()} placeholder={m["court_exchange.filed_by"]()} value={by} onChange={(e) => setBy(e.target.value)} className="w-48" />
              <Button
                disabled={!fileId}
                onClick={() =>
                  run(async () => {
                    const sealed = await fileToCourt(fileId, level, by)
                    if (await saveCourtPackage(sealed)) return m["court_exchange.filed_notice"]()
                  })
                }
              >{m["court_exchange.file_button"]()}</Button>
            </CardContent>
          )}
        </Card>
      </div>
    </article>
  )
}
