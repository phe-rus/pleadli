import { installationOptions } from '@/features/installation'
import { useAddNote } from '@/features/practice/queries'
import { messageOf } from '@/lib/api'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { nextPaint, PaperSheet, printSheet } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { getDocument } from './data'
import { DocumentSheet } from './document-sheet'
import { Letterhead } from './matter-papers'
import { LETTERS } from '@/features/templates'
import { documentKindLabel, type DocumentSummary, type LawyerDocument } from './schema'

type How = 'in_person' | 'email' | 'whatsapp' | 'court'

/**
 * Giving papers to someone: the client, a court registry, the police, the
 * other side. The chosen papers come out together with an acknowledgement
 * slip (printed for a signature, or saved as one PDF to email or send on
 * WhatsApp), and the handover is written into the matter's notes.
 */
export function GivePapers({ matterId, matterTitle, clientName, documents, onDone }: { matterId: string; matterTitle: string; clientName: string; documents: DocumentSummary[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const addNote = useAddNote()
  const { data: install } = useQuery(installationOptions())
  const [chosen, setChosen] = useState<string[]>(documents.slice(0, 1).map((d) => d.id))
  const [to, setTo] = useState(clientName)
  const [how, setHow] = useState<How>('in_person')
  const [loaded, setLoaded] = useState<LawyerDocument[]>([])
  const [busy, setBusy] = useState(false)
  const pack = useRef<HTMLDivElement>(null)

  const give = async () => {
    setBusy(true)
    try {
      const docs = await Promise.all(chosen.map((id) => getDocument(id)))
      setLoaded(docs.filter((d): d is LawyerDocument => !!d))
      // Let the pack render before it leaves.
      await nextPaint()
      if (pack.current) await printSheet(pack.current)
      const list = docs.map((d) => d?.reference ?? d?.title).filter(Boolean).join('; ')
      await addNote.mutateAsync({ matterId, body: m["give.note"]({ to, how: howLabel(how), papers: list, date: formatDay(Date.now()) }) })
      await queryClient.invalidateQueries({ queryKey: ['matters', 'detail', matterId] })
      t.success(m["give.done"]({ to }))
      onDone()
    } catch (error) {
      t.error(m["give.failed"](), { description: messageOf(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <Field>
        <FieldLabel>{m["give.which"]()}</FieldLabel>
        <ul className="flex list-none flex-col gap-1 p-0">
          {documents.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))} />
                <span>{d.reference ?? d.title}</span>
                {!(d.reference ?? d.title).toLowerCase().startsWith(documentKindLabel(d.kind).toLowerCase()) && <span className="text-xs text-muted-foreground">{documentKindLabel(d.kind)}</span>}
              </label>
            </li>
          ))}
        </ul>
      </Field>
      <Field>
        <FieldLabel>{m["give.to"]()}</FieldLabel>
        <Input value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{m["give.how_label"]()}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(['in_person', 'email', 'whatsapp', 'court'] as const).map((h) => (
            <button key={h} type="button" onClick={() => setHow(h)} className={cn('cursor-pointer rounded-lg border px-3 py-1.5 text-sm', how === h ? 'border-primary bg-primary/5' : 'border-border')}>
              {howLabel(h)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{how === 'in_person' || how === 'court' ? m["give.hint_print"]() : m["give.hint_pdf"]()}</p>
      </Field>
      <Button disabled={busy || chosen.length === 0 || !to.trim()} onClick={() => void give()}>
        {how === 'in_person' || how === 'court' ? m["give.print"]() : m["give.save_pdf"]()}
      </Button>

      {/* The pack: each paper, then the acknowledgement slip. Off screen until it leaves. */}
      <div className="pointer-events-none fixed top-0 -left-[9999px] w-[210mm]" aria-hidden>
        <div ref={pack} className="flex flex-col">
          {loaded.map((d) => (
            <div key={d.id} style={{ breakAfter: 'page' }}>
              {d.status === 'filed' && d.content ? (
                <DocumentSheet document={d} />
              ) : (
                <PaperSheet head={LETTERS.has(d.kind) ? <Letterhead /> : undefined}>
                  <RichTextPreview value={d.body} className="[&_li]:mb-1 [&_p]:mb-2" />
                </PaperSheet>
              )}
            </div>
          ))}
          <PaperSheet title={m["give.slip_title"]()}>
            <p className="mb-4">
              {install?.officeName ?? ''}. {matterTitle}
            </p>
            <p className="mb-2">{m["give.slip_body"]({ to, date: formatDay(Date.now()), how: howLabel(how) })}</p>
            <ol className="mb-10 list-decimal ps-6">
              {loaded.map((d) => (
                <li key={d.id}>
                  {d.reference ?? d.title} ({documentKindLabel(d.kind)})
                </li>
              ))}
            </ol>
            <div className="mt-12 flex justify-between gap-8 text-xs">
              <div className="w-56 border-t border-current pt-1">{m["give.received_by"]()}: {to}</div>
              <div className="w-56 border-t border-current pt-1">{m["give.given_by"]()}</div>
            </div>
          </PaperSheet>
        </div>
      </div>
    </div>
  )
}

function howLabel(h: How) {
  return { in_person: m["give.how.in_person"], email: m["give.how.email"], whatsapp: m["give.how.whatsapp"], court: m["give.how.court"] }[h]()
}
