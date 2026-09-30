import { DateField } from '@/components/date-field'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { documentKindLabel, getDocument, type LawyerDocument } from '@/features/documents'
import { installationOptions, useActor } from '@/features/installation'
import type { DocumentSummary } from '@/features/matters/schema'
import { api, messageOf, seg } from '@/lib/api'
import { formatDay } from '@/lib/dates'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Download04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { filingSchema, type Filing } from './schema'
import { buildFilingPack, savePack } from './pack'
import { buildDocumentsDocx, saveFile } from '@/features/export'


type FilingInput = { documentIds: string[]; filedOn: number; court: string | null; courtReference: string | null; feeAmount: number | null; feePrn: string | null }
const useCreateFiling = () => useMutation({ mutationFn: async (v: { matterId: string; input: FilingInput }) => filingSchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/filings`, { body: v.input })) })
const useRecordService = () =>
  useMutation({ mutationFn: async (v: { id: string; input: { servedOn: number; servedTo: string; method: string; note: string | null } }) => filingSchema.parse(await api('PUT', `/api/filings/${seg(v.id)}/service`, { body: v.input })) })

const methods = ['personal', 'advocate', 'registered_post', 'email', 'substituted'] as const
const methodLabel = (id: string) =>
  ({
    personal: m["filing.method.personal"],
    advocate: m["filing.method.advocate"],
    registered_post: m["filing.method.registered_post"],
    email: m["filing.method.email"],
    substituted: m["filing.method.substituted"],
  })[id as (typeof methods)[number]]?.() ?? id

const ugx = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(amount)

function FileForm({ matterId, court, drafts, onDone }: { matterId: string; court: string | null; drafts: DocumentSummary[]; onDone: () => void }) {
  const create = useCreateFiling()
  const [chosen, setChosen] = useState<string[]>(drafts.map((d) => d.id))
  const [day, setDay] = useState(toIsoDay(Date.now()))
  const [where, setWhere] = useState(court ?? '')
  const [reference, setReference] = useState('')
  const [fee, setFee] = useState('')
  const [prn, setPrn] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        const filedOn = fromDateInput(day)
        if (!filedOn) return
        create.mutate(
          { matterId, input: { documentIds: chosen, filedOn, court: where.trim() || null, courtReference: reference.trim() || null, feeAmount: fee.trim() ? Number(fee.replace(/[^\d]/g, '')) : null, feePrn: prn.trim() || null } },
          {
            onSuccess: () => {
              t.success(m["filing.filed"]({ count: chosen.length }))
              onDone()
            },
            onError: (error) => setRefusal(messageOf(error)),
          },
        )
      }}
    >
      <strong>{m["filing.form_title"]()}</strong>
      <p className="text-muted-foreground">{m["filing.form_lead"]()}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{m["filing.which"]()}</legend>
        {drafts.map((d) => (
          <label key={d.id} className="flex items-center gap-2">
            <Checkbox checked={chosen.includes(d.id)} onCheckedChange={(v) => setChosen((c) => (v ? [...c, d.id] : c.filter((x) => x !== d.id)))} />
            <span>
              {d.title}
              {!d.title.toLowerCase().includes(d.kind.replace(/_/g, ' ')) && <span className="text-muted-foreground"> · {documentKindLabel(d.kind)}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DateField label={m["filing.filed_on"]()} value={day} onChange={setDay} />
        <label className="flex flex-col gap-1.5">
          <span>{m["filing.court"]()}</span>
          <Input value={where} onChange={(e) => setWhere(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span>{m["filing.court_reference"]()}</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="HCCS 88/2026" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span>{m["filing.fee"]()}</span>
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" placeholder="150000" />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span>{m["filing.prn"]()}</span>
          <Input value={prn} onChange={(e) => setPrn(e.target.value)} placeholder="2260000123456" />
        </label>
      </div>
      {refusal && (
        <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
          {refusal}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={chosen.length === 0 || create.isPending}>
          {m["filing.submit"]({ count: chosen.length })}
        </Button>
      </div>
    </form>
  )
}

function ServiceForm({ filing, onDone }: { filing: Filing; onDone: () => void }) {
  const record = useRecordService()
  const [day, setDay] = useState(toIsoDay(Date.now()))
  const [to, setTo] = useState('')
  const [method, setMethod] = useState<string>('advocate')
  const [note, setNote] = useState('')
  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const servedOn = fromDateInput(day)
        if (!servedOn) return
        record.mutate(
          { id: filing.id, input: { servedOn, servedTo: to, method, note: note.trim() || null } },
          { onSuccess: () => (t.success(m["filing.service_recorded"]()), onDone()), onError: (error) => t.error(m["filing.service_failed"](), { description: messageOf(error) }) },
        )
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DateField label={m["filing.served_on"]()} value={day} onChange={setDay} />
        <label className="flex flex-col gap-1.5">
          <span>{m["filing.served_to"]()}</span>
          <Input value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <Select items={methods.map((x) => ({ value: x, label: methodLabel(x) }))} value={method} onValueChange={(v) => v && setMethod(v)}>
        <SelectTrigger aria-label={m["filing.method_label"]()} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {methods.map((x) => (
              <SelectItem key={x} value={x}>
                {methodLabel(x)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input aria-label={m["event.note"]()} placeholder={m["event.note"]()} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!to.trim() || record.isPending}>
          {m["filing.record_service"]()}
        </Button>
      </div>
    </form>
  )
}

/** A matter's filings: what went to court together, the registry's
 * references, the fee, service, and the pack to upload or print. */
export function FilingsSection({ matterId, matterTitle, court, open, filings, documents }: { matterId: string; matterTitle: string; court: string | null; open: boolean; filings: Filing[]; documents: DocumentSummary[] }) {
  const actor = useActor()
  const { data: install } = useQuery(installationOptions())
  const [filing, setFiling] = useState(false)
  const [serving, setServing] = useState<string | null>(null)
  const [building, setBuilding] = useState<string | null>(null)
  const drafts = documents.filter((d) => d.status === 'draft')
  const advocate = actor?.role === 'advocate'

  const download = async (f: Filing) => {
    setBuilding(f.id)
    try {
      const docs = (await Promise.all(f.documents.map((d) => getDocument(d.id)))).filter((d): d is LawyerDocument => !!d)
      const bytes = await buildFilingPack({
        firm: install?.officeName ?? null,
        address: install?.address ?? null,
        court: f.court,
        courtReference: f.courtReference,
        matterTitle,
        filedOn: formatDay(f.filedOn),
        filedBy: f.filedBy,
        fee: f.feeAmount != null ? `${ugx(f.feeAmount)}${f.feePrn ? `, PRN ${f.feePrn}` : ''}` : null,
        documents: docs,
        labels: {
          cover: m["filing.pack.cover"](),
          index: m["filing.pack.index"](),
          document: m["filing.pack.document"](),
          reference: m["filing.pack.reference"](),
          page: m["filing.pack.page"](),
          filedOn: m["filing.pack.filed_on"](),
          filedBy: m["filing.pack.filed_by"](),
          fee: m["filing.pack.fee"](),
          verify: m["document.verify_code"](),
        },
      })
      if (await savePack(bytes, `${f.courtReference ?? matterTitle} ${toIsoDay(f.filedOn)}.pdf`)) t.success(m["filing.pack.saved"]())
    } catch (error) {
      t.error(m["filing.pack.failed"](), { description: messageOf(error) })
    } finally {
      setBuilding(null)
    }
  }

  const downloadWord = async (f: Filing) => {
    setBuilding(f.id)
    try {
      const docs = (await Promise.all(f.documents.map((d) => getDocument(d.id)))).filter((d): d is LawyerDocument => !!d)
      const bytes = await buildDocumentsDocx(docs, install?.officeName ?? null, `${matterTitle}, ${formatDay(f.filedOn)}`)
      if (await saveFile(bytes, `${f.courtReference ?? matterTitle} ${toIsoDay(f.filedOn)}.docx`, 'docx')) t.success(m["export.saved"]())
    } catch (error) {
      t.error(m["export.failed"](), { description: messageOf(error) })
    } finally {
      setBuilding(null)
    }
  }

  return (
    <section aria-labelledby="filings" className="page-section">
      <div className="section-head">
        <h2 id="filings">{m["filing.title"]()}</h2>
        {open && advocate && drafts.length > 0 && !filing && (
          <Button size="sm" variant="ghost" onClick={() => setFiling(true)}>
            {m["filing.file_documents"]()}
          </Button>
        )}
      </div>
      {open && !advocate && drafts.length > 0 && <p className="text-muted-foreground">{m["document.advocate_files"]()}</p>}
      {filing && <FileForm matterId={matterId} court={court} drafts={drafts} onDone={() => setFiling(false)} />}
      {filings.length === 0 ? (
        !filing && <EmptyNote>{drafts.length ? m["filing.none_yet"]() : m["filing.none"]()}</EmptyNote>
      ) : (
        <RowList>
          {filings.map((f) => (
            <div key={f.id} className="flex flex-col">
              <Row
                aligned
                title={`${formatDay(f.filedOn)} · ${f.court ?? ''}${f.courtReference ? `, ${f.courtReference}` : ''}`}
                summary={[
                  f.documents.map((d) => d.reference ?? d.title).join(', '),
                  f.feeAmount != null ? `${m["filing.fee_short"]()} ${ugx(f.feeAmount)}${f.feePrn ? ` (PRN ${f.feePrn})` : ''}` : null,
                  f.servedOn ? m["filing.served_summary"]({ who: f.servedTo ?? '', day: formatDay(f.servedOn), how: methodLabel(f.serviceMethod ?? '').toLowerCase() }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <>
                    {f.servedOn ? <Tag tone="done">{m["filing.served"]()}</Tag> : <Tag tone="waiting">{m["filing.not_served"]()}</Tag>}
                    {!f.servedOn && open && (
                      <Button size="sm" variant="ghost" onClick={() => setServing(serving === f.id ? null : f.id)}>
                        {m["filing.record_service"]()}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={building === f.id} onClick={() => void download(f)}>
                      <HugeiconsIcon icon={Download04Icon} />
                      {building === f.id ? m["filing.pack.building"]() : m["filing.pack.download"]()}
                    </Button>
                    <Button size="sm" variant="outline" disabled={building === f.id} onClick={() => void downloadWord(f)}>
                      Word
                    </Button>
                  </>
                }
              />
              {serving === f.id && <ServiceForm filing={f} onDone={() => setServing(null)} />}
            </div>
          ))}
        </RowList>
      )}
    </section>
  )
}
