import * as m from '@/paraglide/messages'
import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useCallback, useEffect, useState } from 'react'
import { listCourtFilings, sendCourtFiling, savePackage, type CourtFiling } from './data'

const KINDS = ['application', 'bail_application', 'notice_of_appeal', 'defence', 'submissions', 'other'] as const
const kindLabel = (k: string) => (m as unknown as Record<string, () => string>)[`court_send_kind_${k}`]?.() ?? k

/** Counsel files a document in the case, as a sealed file for the court registry
 * that is connected. The court answers with a receipt that is read in Notices. */
export function SendToCourt({ matterId }: { matterId: string }) {
  const [filings, setFilings] = useState<CourtFiling[]>([])
  const [kind, setKind] = useState<string>('application')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [by, setBy] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => setFilings(await listCourtFilings(matterId)), [matterId])
  useEffect(() => {
    load().catch(() => undefined)
  }, [load])
  const send = async () => {
    try {
      const sealed = await sendCourtFiling(matterId, kind, title, text, by)
      if (await savePackage(sealed)) {
        setNotice({ text: m.court_send_saved() })
        setTitle('')
        setText('')
      }
      await load()
    } catch (e) {
      setNotice({ text: messageOf(e), error: true })
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <h3>{m.court_send_title()}</h3>
      <p className="text-muted-foreground">{m.court_send_desc()}</p>
      {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
      <div className="flex flex-wrap gap-2">
        <select aria-label={m.court_send_kind()} value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2">
          {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </select>
        <Input aria-label={m.court_send_doc_title()} placeholder={m.court_send_doc_title()} value={title} onChange={(e) => setTitle(e.target.value)} className="w-72" />
        <Input aria-label={m.court_send_by()} placeholder={m.court_send_by()} value={by} onChange={(e) => setBy(e.target.value)} className="w-56" />
      </div>
      <textarea aria-label={m.court_send_text()} placeholder={m.court_send_text()} value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full rounded-md border border-input bg-background p-2" />
      <div><Button disabled={!title.trim() || !text.trim()} onClick={() => void send()}>{m.court_send_button()}</Button></div>
      {filings.map((f) => (
        <p key={f.id} className="text-muted-foreground">
          {f.title} · {kindLabel(f.kind)} · {f.outcome === 'accepted' ? m.court_send_accepted() : f.outcome === 'rejected' ? m.court_send_returned({ reason: f.reason ?? '' }) : m.court_send_waiting()}
        </p>
      ))}
    </section>
  )
}
