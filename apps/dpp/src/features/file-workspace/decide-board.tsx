import { ChoiceSelect } from '@/components/choice-select'
import { PanelButton } from '@/components/add-panel'
import { ChargeForm, useChargesForFile } from '@/features/charges'
import { ChargingReviewSection, useReviewsForFile } from '@/features/charging-review'
import { chargingDecisionTypes } from '@/features/charging-review/schema'
import { useProsecutionFile } from '@/features/prosecution-files'
import { DecisionForm, availableDecisionTypes, decisionTypeLabel, useDecisions } from '@/features/decisions'
import { useGuide } from '@/features/guide'
import { useBrand } from '@/features/installation'
import { useReviewElements } from '@/features/pipeline/peruse-brief'
import * as m from '@/paraglide/messages'
import { api } from '@/lib/api'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as z from 'zod'
import { useEffect, useState } from 'react'
import { CountedTabs } from '@pleadli/shell'

const main = [
  ['sanction', 'sanction'],
  ['return_for_investigation', 'return'],
  ['decline', 'close'],
] as const
const lbl = 'text-xs font-semibold tracking-wide text-muted-foreground'

type Tick = { done: boolean; page: string }
const checkSchema = z.array(z.object({ item: z.string(), done: z.boolean(), page: z.string().nullable() }))

/** The proving checklist lives on the file, so it moves with it and the signed
 * decision can carry a copy of it in its reasons. */
function useTicks(fileId: string) {
  const qc = useQueryClient()
  const key = ['proving', fileId] as const
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => checkSchema.parse(await api('GET', '/api/proving', { query: { fileId } })) })
  const save = useMutation({
    mutationFn: (c: { item: string; done: boolean; page: string }) => api('PUT', '/api/proving', { body: { fileId, ...c } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const ticks: Record<string, Tick> = Object.fromEntries(data.map((c) => [c.item, { done: c.done, page: c.page ?? '' }]))
  const set = (item: string, p: Partial<Tick>) => save.mutate({ item, ...(ticks[item] ?? { done: false, page: '' }), ...p })
  return [ticks, set] as const
}

/** The page note types freely and saves when the field is left. */
function PageInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} placeholder={m["peruse.decide_page"]()} className="h-8 min-w-32 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm" />
}

/** The reasons a signed decision starts from: each thing the offence needs
 * proved, whether the papers show it, and the page it rests on. Written as an
 * editor document so the prosecutor can add to it before signing. */
function provingReasons(items: string[], ticks: Record<string, Tick>) {
  const line = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const lines = items.map((i) => `${ticks[i]?.done ? '✓' : '✗'} ${i}${ticks[i]?.page ? ` (${ticks[i].page})` : ''}`)
  return JSON.stringify({ type: 'doc', content: lines.length ? lines.map(line) : [{ type: 'paragraph' }] })
}

/** The Decide board: choose, see the charge, give reasons by checking what the
 * offence needs proved, then sign. Beside it, what this office has decided. */
export function DecideBoard({ fileId }: { fileId: string }) {
  const { data: charges = [] } = useChargesForFile(fileId)
  const { data: brand } = useBrand()
  const { data: guide = [] } = useGuide(brand?.jurisdiction ?? undefined)
  const { data: decisions = [] } = useDecisions()
  const qc = useQueryClient()
  const removeCharge = useMutation({
    mutationFn: (id: string) => api('DELETE', `/api/charges/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => t.error(m["peruse.decide_charge"](), { description: e.message }),
  })
  const [choice, setChoice] = useState<string>('sanction')
  const { data: reviews = [] } = useReviewsForFile(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const openReview = reviews.find((r) => r.concludedAt === null)
  const needsReview = chargingDecisionTypes.includes(choice) && !openReview
  const charge = charges[0]
  const offence = charge ? guide.find((o) => o.state === 'in_use' && (charge.offence.toLowerCase().includes(o.title.toLowerCase()) || o.title.toLowerCase().includes(charge.offence.toLowerCase()))) : undefined
  const [ticks, tick] = useTicks(fileId)
  const elements = useReviewElements(fileId)
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const suggestion = (item: string) => elements.find((e) => norm(e.element) === norm(item) || norm(item).startsWith(norm(e.element).slice(0, 40)))
  const proving = offence?.proving ?? []
  const missing = proving.filter((p) => !ticks[p]?.done).length
  const count = (t: string) => decisions.filter((d) => d.decisionType === t).length
  const others = availableDecisionTypes().filter((d) => !main.some(([k]) => k === d.value))
  const isMain = main.some(([k]) => k === choice)

  const decisionTab = (
    <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className={lbl}>{m["peruse.choose"]()}</span>
          <div className="flex flex-wrap gap-3">
            {main
              .filter(([k]) => availableDecisionTypes().some((d) => d.value === k))
              .map(([kind, key]) => (
                <button key={kind} type="button" onClick={() => setChoice(kind)} className={cn('flex min-w-44 flex-1 cursor-pointer flex-col gap-1 rounded-2xl p-4 text-left ring-1', choice === kind ? 'bg-primary/5 ring-2 ring-primary' : 'bg-card ring-border hover:bg-secondary/40')}>
                  <strong className="text-base font-semibold">{m[`peruse.${key}`]()}</strong>
                  <span className="text-sm text-muted-foreground">{m[`peruse.${key}_about`]()}</span>
                </button>
              ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {m["peruse.other_decisions"]()}
            <ChoiceSelect className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" value={isMain ? '' : choice} onChange={(e) => setChoice(e.target.value || 'sanction')}>
              <option value="">{isMain ? '—' : decisionTypeLabel(choice)}</option>
              {others.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <p className="text-xs text-muted-foreground">{m["peruse.director_only"]()}</p>
        </div>

        {file && (chargingDecisionTypes.includes(choice) || openReview) && (
          <div className="flex flex-col gap-2">
            <span className={lbl}>{m["peruse.decide_tests"]()}</span>
            <ChargingReviewSection fileId={fileId} status={file.currentStatus} />
          </div>
        )}


    </div>
  )
  const chargeTab = (
        <div className="flex flex-col gap-2">
          {charges.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-border">
              <span className="text-sm text-muted-foreground">{m["peruse.decide_no_charge"]()}</span>
              <PanelButton label={m["peruse.decide_add_charge"]()} title={m["peruse.decide_add_charge"]()} description={m["material.add_charge_description"]()}>
                {({ close, setDirty }) => <ChargeForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
              </PanelButton>
            </div>
          ) : (
            charges.map((c, i) => (
              <div key={c.id} className="group/c flex flex-col gap-1 rounded-2xl p-4 ring-1 ring-border">
                <div className="flex items-start justify-between gap-2">
                  <strong className="font-semibold">
                    {charges.length > 1 ? `${i + 1}. ` : ''}
                    {c.offence}
                    {c.statutorySection ? ` · ${c.statutorySection}` : ''}
                  </strong>
                  <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover/c:opacity-100" disabled={removeCharge.isPending} onClick={() => removeCharge.mutate(c.id)} aria-label={m["court.remove"]()}>
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </div>
                {c.particulars && <p className="text-sm leading-relaxed">{c.particulars}</p>}
              </div>
            ))
          )}
        </div>


  )
  const provingTab = offence && proving.length > 0 ? (
    <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className={lbl}>{m["peruse.decide_proving"]({ offence: offence.title.toUpperCase() })}</span>
            <div className="flex flex-col divide-y divide-border/60 rounded-2xl ring-1 ring-border">
              {proving.map((p) => (
                <div key={p} className="flex flex-wrap items-center gap-3 p-3">
                  <label className="flex min-w-0 flex-[1.2_1_14rem] items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!ticks[p]?.done} onChange={(e) => tick(p, { done: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                    {p}
                  </label>
                  <PageInput value={ticks[p]?.page ?? ''} onSave={(page) => tick(p, { page })} />
                  {(() => {
                    const a = suggestion(p)
                    if (!a || (ticks[p]?.done && ticks[p]?.page)) return null
                    return (
                      <div className="flex basis-full items-center gap-2 pl-6 text-xs text-muted-foreground">
                        <span>
                          {a.status === 'shown' ? m["peruse.assist_shows"]({ source: a.source }) : a.status === 'unclear' ? m["peruse.element_unclear"]() : m["peruse.element_not_shown"]()}
                          {a.against?.trim() && <span className="block text-[#9a3a00]">{m["peruse.element_against"]({ text: a.against })}</span>}
                        </span>
                        {a.status === 'shown' && !a.against?.trim() && (
                          <button type="button" className="cursor-pointer text-primary" onClick={() => tick(p, { done: true, page: a.source })}>
                            {m["peruse.assist_use"]()}
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{missing > 0 ? m["peruse.decide_missing"]({ count: missing }) : m["peruse.decide_proving_note"]()}</p>
          </div>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">{m["peruse.tab_proving_none"]()}</p>
  )

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-[min(100%,26rem)] flex-[999_1_32rem] flex-col gap-6">
      <CountedTabs
        tabs={[
          { id: 'decision', label: m["peruse.tab_decision"](), content: decisionTab },
          { id: 'charge', label: m["peruse.tab_charge"](), count: charges.length, content: chargeTab },
          { id: 'proving', label: m["peruse.tab_proving"](), count: proving.length ? `${proving.length - missing}/${proving.length}` : undefined, content: provingTab },
        ]}
      />
        <div className="flex flex-col gap-2">
          {!needsReview && (
            <PanelButton label={m["peruse.decide_sign"]()} title={m["peruse.decide_sign"]()} description={m["file_ws.record_decision_description"]()} variant="default" icon={false}>
              {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} defaultType={choice} review={openReview} defaultReasons={proving.length && choice !== 'return_for_investigation' ? provingReasons(proving, ticks) : undefined} onSuccess={close} onDirtyChange={setDirty} />}
            </PanelButton>
          )}
          <p className="text-sm text-muted-foreground">{needsReview ? m["peruse.decide_start_first"]() : m["peruse.decide_sign_about"]()}</p>
        </div>

      </div>

      <aside className="flex min-w-[min(100%,16rem)] flex-[1_1_16rem] flex-col gap-3 rounded-2xl bg-secondary/40 p-5 lg:max-w-72">
        <b className="font-semibold">{m["peruse.decide_before"]()}</b>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m["peruse.decide_before_none"]()}</p>
        ) : (
          <p className="text-sm leading-relaxed">{m["peruse.decide_before_counts"]({ total: decisions.length, sanctioned: count('sanction'), returned: count('return_for_investigation'), declined: count('decline') })}</p>
        )}
        <p className="text-xs text-muted-foreground">{m["peruse.decide_before_note"]()}</p>
      </aside>
    </div>
  )
}
