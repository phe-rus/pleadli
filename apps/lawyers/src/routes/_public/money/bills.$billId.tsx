import { DateField } from '@/components/date-field'
import { Tag } from '@/components/status-tag'
import { savePack } from '@/features/filings'
import { installationOptions } from '@/features/installation'
import { matterOptions } from '@/features/matters/queries'
import { billOptions, billPdf, costsScaleOptions, instructionBases, parseShillings, ugx, useDeleteBill, useKeepsBooks, useUpdateBill, type Bill, type BillInput, type InstructionBasis, type ItemInput } from '@/features/money'
import { messageOf } from '@/lib/api'
import { formatDay } from '@/lib/dates'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/money/bills/$billId')({
  component: RouteComponent,
})

const basisLabel = (b: string) =>
  ({ '1_1': m["bill.basis.full"], '1_2': m["bill.basis.no_defence"], '1_3': m["bill.basis.leave_refused"], '1_4': m["bill.basis.settled"] })[b as InstructionBasis]?.() ?? b

type Row = Omit<ItemInput, 'claimed' | 'agreed' | 'taxed'> & { claimed: string; agreed: string; taxed: string }
const toRows = (bill: Bill): Row[] =>
  bill.items.map((i) => ({ onDay: i.onDay, itemRef: i.itemRef, particulars: i.particulars, disbursement: i.disbursement, claimed: String(i.claimed), agreed: i.agreed == null ? '' : String(i.agreed), taxed: i.taxed == null ? '' : String(i.taxed) }))
const dayText = (ms: number | null) => (ms ? toIsoDay(ms) : '')

/** A bill of costs: priced by the Sixth Schedule, edited here, agreed at the
 * pre-taxation meeting (reg. 13A), then taxed. A taxed bill is kept. */
function RouteComponent() {
  const { billId } = Route.useParams()
  const navigate = useNavigate()
  const keeps = useKeepsBooks()
  const { data: bill } = useQuery(billOptions(billId))
  const { data: detail } = useQuery({ ...matterOptions(bill?.matterId ?? ''), enabled: Boolean(bill) })
  const { data: install } = useQuery(installationOptions())
  const { data: scale } = useQuery(costsScaleOptions())
  const save = useUpdateBill()
  const remove = useDeleteBill()
  const [rows, setRows] = useState<Row[]>([])
  const [value, setValue] = useState('')
  const [basis, setBasis] = useState<InstructionBasis>('1_1')
  const [status, setStatus] = useState<Bill['status']>('draft')
  const [lodged, setLodged] = useState('')
  const [preTaxation, setPreTaxation] = useState('')
  const [taxedOn, setTaxedOn] = useState('')
  const [officer, setOfficer] = useState('')
  const [adding, setAdding] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    if (!bill) return
    setRows(toRows(bill))
    setValue(bill.subjectValue ? String(bill.subjectValue) : '')
    setBasis(bill.instructionBasis)
    setStatus(bill.status)
    setLodged(dayText(bill.lodgedOn))
    setPreTaxation(dayText(bill.preTaxationOn))
    setTaxedOn(dayText(bill.taxedOn))
    setOfficer(bill.taxingOfficer ?? '')
  }, [bill])

  if (!bill) return null
  const frozen = bill.status === 'taxed' || !keeps
  const total = (key: 'claimed' | 'agreed' | 'taxed') => rows.reduce((s, r) => s + (parseShillings(r[key]) ?? 0), 0)
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const input = (): BillInput => ({
    subjectValue: parseShillings(value),
    instructionBasis: basis,
    status,
    lodgedOn: fromDateInput(lodged),
    preTaxationOn: fromDateInput(preTaxation),
    taxedOn: fromDateInput(taxedOn),
    taxingOfficer: officer.trim() || null,
    items: rows.map((r) => ({ onDay: r.onDay, itemRef: r.itemRef, particulars: r.particulars, disbursement: r.disbursement, claimed: parseShillings(r.claimed) ?? 0, agreed: parseShillings(r.agreed), taxed: parseShillings(r.taxed) })),
  })

  const addFromScale = () => {
    const f = scale?.fixed.find((x) => x.item === adding)
    if (!f) return
    const n = Math.max(1, Number(quantity) || 1)
    const amount = f.hourly ? f.fee * n : f.fee + (f.perCopy ?? 0) * (n - 1)
    const what = f.hourly ? m["bill.hours"]({ what: f.what, count: n }) : n > 1 ? m["bill.copies"]({ what: f.what, count: n }) : f.what
    setRows((rs) => [...rs.slice(0, -1), { onDay: null, itemRef: f.item, particulars: what, disbursement: false, claimed: String(amount), agreed: '', taxed: '' }, ...rs.slice(-1)])
    setAdding('')
    setQuantity('1')
  }

  const print = async () => {
    const other = detail?.parties.find((p) => p.role === 'opposing_party')?.name
    try {
      const bytes = await billPdf(
        { ...bill, items: input().items.map((it, i) => ({ ...it, id: String(i), position: i + 1 })) },
        { court: detail?.matter.courtName ?? '', number: detail?.matter.courtNumber ?? '', title: other ? `${detail?.client.name} v. ${other}` : (detail?.matter.title ?? '') },
        { name: install?.officeName ?? '', address: install?.address ?? null },
        {
          heading: m["bill.title"](),
          no: m["bill.col.no"](),
          date: m["bill.col.date"](),
          item: m["bill.col.item"](),
          particulars: m["bill.col.particulars"](),
          claimed: m["bill.col.claimed"](),
          agreed: m["bill.col.agreed"](),
          taxed: m["bill.col.taxed"](),
          total: m["money.col.total"](),
          drawnBy: m["bill.drawn_by"](),
          source: scale?.source ?? '',
        },
        ugx,
        formatDay,
      )
      if (await savePack(bytes, `Bill of costs ${detail?.matter.courtNumber ?? ''}.pdf`)) t.success(m["money.pdf.saved"]())
    } catch (error) {
      t.error(m["money.pdf.failed"](), { description: messageOf(error) })
    }
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["bill.title"]()}</h1>
          <p>
            <Link to="/matters/$matterId" params={{ matterId: bill.matterId }} className="text-foreground">
              {detail?.matter.courtNumber ?? detail?.matter.title}
            </Link>{' '}
            · {bill.against === 'other_side' ? m["bill.against.other_side"]() : m["bill.against.client"]()}
          </p>
        </div>
        <div className="page-actions">
          <Tag tone={bill.status === 'taxed' ? 'done' : bill.status === 'lodged' ? 'waiting' : 'open'}>{m[`bill.status.${bill.status}`]()}</Tag>
          <Button size="sm" variant="secondary" onClick={() => void print()}>
            {m["money.pdf.print"]()}
          </Button>
          {keeps && bill.status === 'draft' && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(bill.id, { onSuccess: () => void navigate({ to: '/matters/$matterId', params: { matterId: bill.matterId } }) })}>
              {m["money.delete_draft"]()}
            </Button>
          )}
        </div>
      </header>

      <section aria-labelledby="bill-basis" className="page-section md:max-w-3xl">
        <h2 id="bill-basis">{m["bill.instructions"]()}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span>{m["bill.value"]()}</span>
            <Input value={value} disabled={frozen} inputMode="numeric" onChange={(e) => setValue(e.target.value)} placeholder="12400000" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span>{m["bill.basis_label"]()}</span>
            <Select value={basis} disabled={frozen} onValueChange={(v) => v && setBasis(v as InstructionBasis)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => basisLabel(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {instructionBases.map((b) => (
                    <SelectItem key={b} value={b}>
                      {basisLabel(b)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
        {bill.scaleInstructionFee != null && <p className="text-muted-foreground">{m["bill.scale_fee"]({ amount: ugx(bill.scaleInstructionFee) })}</p>}
        <p className="text-muted-foreground">{m["bill.scale_note"]()}</p>
      </section>

      <section aria-labelledby="bill-items" className="page-section">
        <h2 id="bill-items">{m["bill.items"]()}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-2">{m["bill.col.no"]()}</th>
                <th className="py-2 pr-2">{m["bill.col.item"]()}</th>
                <th className="py-2 pr-2">{m["bill.col.particulars"]()}</th>
                <th className="py-2 pr-2 text-right">{m["bill.col.claimed"]()}</th>
                <th className="py-2 pr-2 text-right">{m["bill.col.agreed"]()}</th>
                <th className="py-2 pr-2 text-right">{m["bill.col.taxed"]()}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.disbursement ? m["money.line.disbursement"]() : r.itemRef}</td>
                  <td className="py-1.5 pr-2">
                    <Input value={r.particulars} disabled={frozen} onChange={(e) => set(i, { particulars: e.target.value })} />
                    {r.onDay && <span className="text-muted-foreground">{formatDay(r.onDay)}</span>}
                  </td>
                  {(['claimed', 'agreed', 'taxed'] as const).map((k) => (
                    <td key={k} className="w-36 py-1.5 pr-2">
                      <Input value={r[k]} disabled={frozen} inputMode="numeric" className="text-right" onChange={(e) => set(i, { [k]: e.target.value })} />
                    </td>
                  ))}
                  <td className="py-1.5">
                    {!frozen && (
                      <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                        {m["money.remove_line"]()}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3} className="py-2 pr-2 text-left">
                  {m["money.col.total"]()}
                </th>
                <th className="py-2 pr-2 text-right whitespace-nowrap">{ugx(total('claimed'))}</th>
                <th className="py-2 pr-2 text-right whitespace-nowrap">{ugx(total('agreed'))}</th>
                <th className="py-2 pr-2 text-right whitespace-nowrap">{ugx(total('taxed'))}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
        {!frozen && scale && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-72 flex-1 flex-col gap-1.5">
              <span>{m["bill.add_from_scale"]()}</span>
              <Select value={adding} onValueChange={(v) => setAdding(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m["bill.choose_item"]()}>{(v: string) => (v ? `${v} · ${scale.fixed.find((f) => f.item === v)?.what ?? ''}` : m["bill.choose_item"]())}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {scale.fixed.map((f) => (
                      <SelectItem key={f.item} value={f.item}>
                        {f.item} · {f.what} · {ugx(f.fee)}
                        {f.hourly ? m["bill.per_hour"]() : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex w-28 flex-col gap-1.5">
              <span>{scale.fixed.find((f) => f.item === adding)?.hourly ? m["bill.hours_label"]() : m["bill.copies_label"]()}</span>
              <Input value={quantity} inputMode="numeric" onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <Button size="sm" variant="secondary" disabled={!adding} onClick={addFromScale}>
              {m["bill.add"]()}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, { onDay: null, itemRef: null, particulars: '', disbursement: true, claimed: '', agreed: '', taxed: '' }])}>
              {m["bill.add_disbursement"]()}
            </Button>
          </div>
        )}
        {scale && <p className="text-muted-foreground">{m["bill.floors"]({ list: scale.floors.map((f) => `${f.item} ${ugx(f.atLeast)}`).join(' · ') })}</p>}
      </section>

      <section aria-labelledby="bill-taxation" className="page-section md:max-w-3xl">
        <h2 id="bill-taxation">{m["bill.taxation"]()}</h2>
        <p className="text-muted-foreground">{m["bill.reg_13a"]()}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span>{m["money.col.status"]()}</span>
            <Select value={status} disabled={frozen} onValueChange={(v) => v && setStatus(v as Bill['status'])}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => m[`bill.status.${v as Bill['status']}`]()}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(['draft', 'lodged', 'taxed'] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {m[`bill.status.${s}`]()}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span>{m["bill.officer"]()}</span>
            <Input value={officer} disabled={frozen} onChange={(e) => setOfficer(e.target.value)} />
          </label>
          <DateField label={m["bill.lodged_on"]()} value={lodged} onChange={frozen ? () => undefined : setLodged} />
          <DateField label={m["bill.pre_taxation_on"]()} value={preTaxation} onChange={frozen ? () => undefined : setPreTaxation} />
          <DateField label={m["bill.taxed_on"]()} value={taxedOn} onChange={frozen ? () => undefined : setTaxedOn} />
        </div>
        {refusal && (
          <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
            {refusal}
          </p>
        )}
        {!frozen && (
          <Button
            className="w-fit"
            disabled={save.isPending}
            onClick={() => {
              setRefusal(null)
              save.mutate({ id: bill.id, input: input() }, { onSuccess: () => t.success(m["settings.saved"]()), onError: (error) => setRefusal(messageOf(error)) })
            }}
          >
            {m["bill.save"]()}
          </Button>
        )}
        {bill.status === 'taxed' && <p>{m["bill.kept"]()}</p>}
      </section>
    </article>
  )
}
