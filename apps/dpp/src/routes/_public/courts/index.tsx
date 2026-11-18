import { answerInvite, fileToCourt, importCourtPackage, listCourtLinks, pickCourtPackage, saveCourtPackage, type CourtLink } from '@/features/court-exchange/data'
import { listFiles } from '@/features/prosecution-files/data'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/courts/')({ component: RouteComponent })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const STATUS: Record<string, string> = { answered: 'Answered, waiting for the court', trusted: 'Trusted', declined: 'Declined' }

/** Filing to a court: answer a registry's invitation, send it a prosecution file
 * as a sealed file, and take back the receipt that carries the court's number.
 * English for now: the words move into messages with the rest of the DPP catalogue. */
function RouteComponent() {
  const [links, setLinks] = useState<CourtLink[]>([])
  const [files, setFiles] = useState<{ id: string; title: string; odppRegistrationNumber: string | null; courtCaseNumber: string | null }[]>([])
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [contact, setContact] = useState('')
  const [fileId, setFileId] = useState('')
  const [level, setLevel] = useState<'magistrate' | 'high'>('magistrate')
  const [by, setBy] = useState('')

  const load = useCallback(async () => {
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
          <h1>Courts</h1>
          <p className="text-muted-foreground">File a prosecution file to a court registry as a sealed file, and take back the receipt with the court's own case number. Works with no internet.</p>
        </div>
      </header>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Court registries</CardTitle>
            <CardDescription>The registry sends an invitation file. Open it, save your answer, and read the registry the code shown here so it can confirm you. Then open its confirmation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Input aria-label="Contact" placeholder="Who to reach at this office" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full sm:w-64" />
              <Button
                onClick={() =>
                  run(async () => {
                    const invite = await pickCourtPackage()
                    if (!invite) return
                    const answer = await answerInvite(invite, contact)
                    if (await saveCourtPackage(answer)) return `Answered ${answer.courtName}. Send the file back and read them the code below.`
                  })
                }
              >
                Open an invitation
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    const file = await pickCourtPackage()
                    if (file) return (await importCourtPackage(file)).message
                  })
                }
              >
                Open a file from the court
              </Button>
            </div>
            {links.length === 0 ? <p className="text-muted-foreground">No registry has invited this office yet.</p> : links.map((l) => (
              <div key={l.id} className="flex flex-col gap-1 border-t border-border/60 pt-3">
                <span className="flex flex-wrap items-center gap-2">
                  {l.courtName}
                  <Badge variant={l.status === 'trusted' ? 'default' : 'secondary'}>{STATUS[l.status] ?? l.status}</Badge>
                </span>
                {l.status === 'answered' && <span className="text-muted-foreground">Read the registry this code: <span className="font-mono text-foreground">{l.fingerprint}</span></span>}
                {l.reason && <span className="text-muted-foreground">{l.reason}</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File to {trusted ? trusted.courtName : 'a court'}</CardTitle>
            <CardDescription>{trusted ? 'Choose a file. It needs an accused and a charge. The registry registers it with its own number.' : 'Available once a registry has confirmed this office.'}</CardDescription>
          </CardHeader>
          {trusted && (
            <CardContent className="flex flex-wrap items-center gap-2">
              <select aria-label="Prosecution file" value={fileId} onChange={(e) => setFileId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 sm:w-80">
                <option value="">Choose a file</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>{f.title}{f.courtCaseNumber ? ` · ${f.courtCaseNumber}` : ''}</option>
                ))}
              </select>
              <select aria-label="Court level" value={level} onChange={(e) => setLevel(e.target.value as 'magistrate' | 'high')} className="h-9 rounded-md border border-input bg-background px-2">
                <option value="magistrate">Magistrates court</option>
                <option value="high">High Court</option>
              </select>
              <Input aria-label="Filed by" placeholder="Filed by" value={by} onChange={(e) => setBy(e.target.value)} className="w-48" />
              <Button
                disabled={!fileId}
                onClick={() =>
                  run(async () => {
                    const sealed = await fileToCourt(fileId, level, by)
                    if (await saveCourtPackage(sealed)) return 'Filing saved. Send it to the registry.'
                  })
                }
              >
                File
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </article>
  )
}
