import { DateField } from '@/components/date-field'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { useAssistSettings } from '@/features/assist/queries'
import { eventLabel, useRecordEvent } from '@/features/clocks'
import { useActor } from '@/features/installation'
import { formatDay } from '@/lib/dates'
import { fromDateInput } from '@/lib/day'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { paperFile, paperKinds, paperTextOptions, useAddPaper, useEditPaper, usePapers, useReadPapers, useRemovePaper, type Found, type Paper, type PaperKind } from './data'
import { kindOfMime, saveFile } from '@/features/export'

export const paperKindLabel = (kind: string) =>
  ({
    pleading: m["paper.kind.pleading"],
    court_document: m["paper.kind.court_document"],
    letter: m["paper.kind.letter"],
    contract: m["paper.kind.contract"],
    receipt: m["paper.kind.receipt"],
    identity: m["paper.kind.identity"],
    evidence: m["paper.kind.evidence"],
    other: m["paper.kind.other"],
  })[kind as PaperKind]?.() ?? kind

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
/** YYYY-MM-DD as the paper bears it, shown as a day. */
const paperDay = (day: string) => formatDay(fromDateInput(day) ?? 0)

/** The papers of a matter: what the client brought, or the other side and the
 * court sent, photographed or scanned in. Assist can read them: it names and
 * dates each (shown as unchecked until someone edits it) and points out the
 * steps that start or stop a deadline here, for a person to record. */
export function PapersSection({ matterId, open }: { matterId: string; open: boolean }) {
  const actor = useActor()
  const { data: papers = [] } = usePapers(matterId)
  const { data: assist } = useAssistSettings()
  const add = useAddPaper()
  const read = useReadPapers()
  const record = useRecordEvent()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [chosen, setChosen] = useState<string[]>([])
  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [found, setFound] = useState<Found[]>([])
  const [recorded, setRecorded] = useState<string[]>([])
  const [refusal, setRefusal] = useState<string | null>(null)

  if (actor?.role === 'accounts') return null

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    setUploading(list.length)
    const added: string[] = []
    for (const file of list) {
      try {
        added.push((await add.mutateAsync({ matterId, file })).id)
      } catch (error) {
        t.error(m["paper.add_failed"]({ name: file.name }), { description: messageOf(error) })
      }
      setUploading((n) => n - 1)
    }
    if (added.length) {
      t.success(m["paper.added"]({ count: added.length }))
      setChosen(added.slice(0, 6))
    }
  }

  const readChosen = () => {
    setRefusal(null)
    read.mutate(
      { matterId, paperIds: chosen },
      {
        onSuccess: (r) => {
          setFound(r.found)
          setRecorded([])
          setChosen([])
          t.success(m["paper.read_done"]({ count: r.papers.length }))
        },
        onError: (error) => setRefusal(messageOf(error)),
      },
    )
  }

  const keyOf = (f: Found) => `${f.event}-${f.on}-${f.paperId}`

  return (
    <section aria-labelledby="papers" className="page-section">
      <div className="flex items-center justify-between gap-2">
        <h2 id="papers">{m["paper.title"]()}</h2>
        <div className="flex gap-2">
          {chosen.length > 0 && assist?.ready && (
            <Button size="sm" variant="secondary" disabled={read.isPending} onClick={readChosen}>
              {read.isPending ? m["paper.reading"]() : m["paper.read"]({ count: chosen.length })}
            </Button>
          )}
          {open && (
            <Button size="sm" variant="ghost" disabled={uploading > 0} onClick={() => input.current?.click()}>
              {uploading > 0 ? m["paper.uploading"]({ count: uploading }) : m["paper.add"]()}
            </Button>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {chosen.length > 0 && !assist?.ready && <p className="text-muted-foreground">{m["paper.assist_off"]()}</p>}
      {refusal && (
        <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
          {refusal}
        </p>
      )}

      {found.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <strong>{m["paper.found_title"]()}</strong>
          <p className="text-muted-foreground">{m["paper.found_lead"]()}</p>
          <RowList>
            {found.map((f) => (
              <Row
                key={keyOf(f)}
                aligned
                title={`${eventLabel(f.event)}, ${paperDay(f.on)}`}
                summary={[f.note, papers.find((p) => p.id === f.paperId)?.title].filter(Boolean).join(' · ')}
                trailing={
                  recorded.includes(keyOf(f)) ? (
                    <Tag tone="done">{m["paper.found_recorded"]()}</Tag>
                  ) : (
                    open && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={record.isPending}
                        onClick={() =>
                          record.mutate(
                            { matterId, input: { kind: f.event, onDay: fromDateInput(f.on) ?? Date.now(), note: f.note } },
                            { onSuccess: () => setRecorded((r) => [...r, keyOf(f)]), onError: (error) => t.error(m["event.record_failed"](), { description: messageOf(error) }) },
                          )
                        }
                      >
                        {m["event.record"]()}
                      </Button>
                    )
                  )
                }
              />
            ))}
          </RowList>
        </div>
      )}

      {papers.length === 0 ? (
        <EmptyNote>{m["paper.none"]()}</EmptyNote>
      ) : (
        <RowList>
          {papers.map((p) => (
            <div key={p.id} className="flex flex-col">
              <div className="flex items-start gap-2">
                <Checkbox
                  className="mt-4"
                  aria-label={m["paper.choose"]({ title: p.title })}
                  checked={chosen.includes(p.id)}
                  disabled={!chosen.includes(p.id) && chosen.length >= 6}
                  onCheckedChange={(v) => setChosen((c) => (v ? [...c, p.id] : c.filter((x) => x !== p.id)))}
                />
                <Row
                  className="min-w-0 flex-1"
                  title={p.title}
                  summary={[p.dated ? paperDay(p.dated) : null, paperKindLabel(p.kind), p.fromWhom, size(p.sizeBytes)].filter(Boolean).join(' · ')}
                  trailing={
                    <>
                      {p.assisted && <Tag tone="waiting">{m["paper.unchecked"]()}</Tag>}
                      <Button size="sm" variant="ghost" onClick={() => setViewing(viewing === p.id ? null : p.id)}>
                        {viewing === p.id ? m["paper.hide"]() : m["paper.open"]()}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                        {m["paper.edit"]()}
                      </Button>
                    </>
                  }
                >
                  {p.summary && <p className="text-muted-foreground">{p.summary}</p>}
                </Row>
              </div>
              {viewing === p.id && <PaperView paper={p} />}
              {editing === p.id && <PaperForm paper={p} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </RowList>
      )}
    </section>
  )
}

/** The page itself (a photo inline, a PDF in a frame) and the text Assist read. */
function PaperView({ paper }: { paper: Paper }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { data: text } = useQuery({ ...paperTextOptions(paper.id), enabled: paper.hasTranscript })
  useEffect(() => {
    let made: string | null = null
    paperFile(paper.id)
      .then((f) => {
        const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
        made = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }))
        setUrl(made)
      })
      .catch((error) => setFailed(messageOf(error)))
    return () => {
      if (made) URL.revokeObjectURL(made)
    }
  }, [paper.id])

  const download = async () => {
    try {
      const f = await paperFile(paper.id)
      const kind = kindOfMime(f.mimeType)
      if (!kind) return
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
      const name = f.fileName.includes('.') ? f.fileName : `${paper.title}.${kind}`
      if (await saveFile(bytes, name, kind)) t.success(m["export.saved"]())
    } catch (error) {
      t.error(m["export.failed"](), { description: messageOf(error) })
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void download()}>
          {m["export.download"]()}
        </Button>
      </div>
      {failed && <p className="not-typeset text-destructive">{failed}</p>}
      {url &&
        (paper.mimeType === 'application/pdf' ? (
          <iframe title={paper.title} src={url} className="h-[32rem] w-full rounded-md border border-border" />
        ) : (
          <img src={url} alt={paper.title} className="max-h-[32rem] w-fit max-w-full rounded-md border border-border object-contain" />
        ))}
      {text?.transcript && (
        <details>
          <summary className="cursor-pointer">{m["paper.transcript"]()}</summary>
          <p className="mt-2 whitespace-pre-line">{text.transcript}</p>
        </details>
      )}
    </div>
  )
}

function PaperForm({ paper, onDone }: { paper: Paper; onDone: () => void }) {
  const edit = useEditPaper()
  const remove = useRemovePaper()
  const [title, setTitle] = useState(paper.title)
  const [kind, setKind] = useState<PaperKind>(paper.kind)
  const [dated, setDated] = useState(paper.dated ?? '')
  const [from, setFrom] = useState(paper.fromWhom ?? '')
  const [summary, setSummary] = useState(paper.summary ?? '')
  const [confirming, setConfirming] = useState(false)

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        edit.mutate(
          { id: paper.id, input: { title, kind, dated: dated || null, fromWhom: from || null, summary: summary || null } },
          { onSuccess: () => onDone(), onError: (error) => t.error(m["settings.save_failed"](), { description: messageOf(error) }) },
        )
      }}
    >
      {paper.assisted && <p className="text-muted-foreground">{m["paper.check_lead"]()}</p>}
      <label className="flex flex-col gap-1.5">
        <span>{m["paper.field.title"]()}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span>{m["paper.field.kind"]()}</span>
          <Select value={kind} onValueChange={(v) => v && setKind(v as PaperKind)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => paperKindLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {paperKinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {paperKindLabel(k)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <DateField label={m["paper.field.dated"]()} value={dated} onChange={setDated} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span>{m["paper.field.from"]()}</span>
        <Input value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span>{m["paper.field.summary"]()}</span>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-20" />
      </label>
      <div className="flex flex-wrap justify-between gap-2">
        {confirming ? (
          <span className="flex items-center gap-2">
            <span>{m["paper.remove_confirm"]()}</span>
            <Button type="button" size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(paper.id, { onSuccess: onDone, onError: (error) => t.error(m["paper.remove_failed"](), { description: messageOf(error) }) })}>
              {m["paper.remove"]()}
            </Button>
          </span>
        ) : (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
            {m["paper.remove"]()}
          </Button>
        )}
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {m["common.cancel"]()}
          </Button>
          <Button type="submit" size="sm" disabled={!title.trim() || edit.isPending}>
            {paper.assisted ? m["paper.save_checked"]() : m["settings.save"]()}
          </Button>
        </span>
      </div>
    </form>
  )
}
