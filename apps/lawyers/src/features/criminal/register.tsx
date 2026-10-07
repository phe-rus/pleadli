import { Createpanel } from '@/components/create-panel'
import { DateField } from '@/components/date-field'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { saveFile } from '@/features/export/save'
import { purposeLabel } from '@/features/hearings/schema'
import { stageLabel } from '@/features/matter-types'
import { matterOptions, MatterForm } from '@/features/matters'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { PaperSheet, printSheet } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { Segmented } from '@pleadli/ui/segmented'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { remandClock, useCriminalRegister, useSetCustodyDates, type CriminalRow } from './data'

const STAGES = ['instructions', 'custody_bail', 'plea_disclosure', 'trial', 'sentence', 'appeal'] as const

/** Each stage keeps one colour everywhere: the count, the pill, the card. */
const stageTone: Record<string, string> = {
  instructions: 'bg-secondary text-foreground',
  custody_bail: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  plea_disclosure: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  trial: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  sentence: 'bg-rose-500/15 text-rose-800 dark:text-rose-200',
  appeal: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
}

const barTone = { over: 'bg-red-500', near: 'bg-amber-500', running: 'bg-primary', committed: 'bg-muted-foreground', none: 'bg-emerald-500', unknown: 'bg-muted' } as const

const caseNo = (r: CriminalRow) => r.courtNumber || r.ourRef || r.id.slice(0, 8)
const toDay = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')
const fromDay = (day: string) => (day ? new Date(`${day}T12:00:00`).getTime() : null)

function StagePill({ stage }: { stage: string }) {
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap', stageTone[stage] ?? stageTone.instructions)}>{stageLabel(stage)}</span>
}

function custodyText(custody: string | null) {
  return custody === 'remanded' ? m["criminal.remanded"]() : custody === 'serving' ? m["criminal.serving"]() : m["criminal.at_liberty"]()
}

function RemandBar({ row, wide = false }: { row: CriminalRow; wide?: boolean }) {
  const clock = remandClock(row)
  if (clock.state === 'none') return <span className="text-xs text-muted-foreground">{custodyText(row.custody)}</span>
  if (clock.state === 'unknown') return <span className="text-xs text-muted-foreground">{m["criminal.no_date"]()}</span>
  const pct = clock.state === 'committed' ? 100 : Math.min(100, Math.round((clock.days / clock.limit) * 100))
  return (
    <div className={cn('flex flex-col gap-0.5', wide ? 'w-full' : 'w-24')}>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-1 rounded-full', barTone[clock.state])} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.625rem] text-muted-foreground tabular-nums">
        {clock.state === 'committed' ? m["criminal.committed_days"]({ days: String(clock.days) }) : m["criminal.days"]({ days: String(clock.days), limit: String(clock.limit) })}
      </span>
    </div>
  )
}

/** The side panel of one case: an alert when the remand clock is near or past
 * its limit, the case details, the remand tracker (its dates edited here) and
 * the trial history from the matter's hearings. */
function CasePanel({ row, onClose }: { row: CriminalRow; onClose: () => void }) {
  const { data: detail } = useQuery(matterOptions(row.id))
  const save = useSetCustodyDates()
  const [remanded, setRemanded] = useState(toDay(row.remandedOn))
  const [committed, setCommitted] = useState(toDay(row.committedOn))
  const clock = remandClock(row)
  const hearings = [...(detail?.hearings ?? [])].sort((a, b) => a.at - b.at)
  const pct = clock.state === 'committed' ? 100 : Math.min(100, Math.round((clock.days / clock.limit) * 100))

  return (
    <Createpanel open onOpenChange={(o) => !o && onClose()} headings={{ title: caseNo(row), description: `${m["criminal.uganda_v"]()} ${row.clientName}` }}>
      <div className="flex flex-col gap-5">
        {(clock.state === 'over' || clock.state === 'near') && (
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {clock.state === 'over' ? m["criminal.alert.over"]({ days: String(clock.days), limit: String(clock.limit) }) : m["criminal.alert.near"]({ days: String(clock.days), limit: String(clock.limit) })}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="border-b border-border/60 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{m["criminal.panel.details"]()}</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              [m["criminal.charge"](), row.offence ?? '...'],
              [m["criminal.col.stage"](), stageLabel(row.stage)],
              [m["criminal.custody"](), `${custodyText(row.custody)}${row.custodyPlace ? `, ${row.custodyPlace}` : ''}`],
              [m["criminal.panel.court"](), row.courtName ?? '...'],
              [m["criminal.panel.filed"](), formatDay(row.createdAt)],
              [m["criminal.col.adj"](), m["criminal.panel.adjournments"]({ count: String(row.adjournments) })],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-secondary/60 px-3 py-2">
                <p className="text-[0.625rem] text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="border-b border-border/60 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{m["criminal.panel.tracker"]()}</h3>
          <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{m["criminal.col.remand"]()}</span>
              <span className="text-sm font-semibold tabular-nums">{clock.state === 'none' ? custodyText(row.custody) : clock.state === 'unknown' ? m["criminal.no_date"]() : m["criminal.days"]({ days: String(clock.days), limit: String(clock.limit) })}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background">
              <div className={cn('h-1.5 rounded-full', barTone[clock.state])} style={{ width: `${clock.state === 'none' || clock.state === 'unknown' ? 0 : pct}%` }} />
            </div>
            <p className="text-[0.625rem] text-muted-foreground">{clock.state === 'committed' ? m["criminal.panel.committed_note"]() : row.courtLevel === 'high' ? m["criminal.panel.limit_high"]() : m["criminal.panel.limit_lower"]()}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DateField label={m["criminal.panel.remanded_on"]()} value={remanded} onChange={setRemanded} />
            <DateField label={m["criminal.panel.committed_on"]()} value={committed} onChange={setCommitted} />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="self-end"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { id: row.id, remandedOn: fromDay(remanded), committedOn: fromDay(committed) },
                { onSuccess: () => t.success(m["criminal.panel.saved"]()), onError: (e) => t.error(e instanceof Error ? e.message : String(e)) },
              )
            }
          >
            {m["criminal.panel.save_dates"]()}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="border-b border-border/60 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{m["criminal.panel.history"]()}</h3>
          {hearings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m["criminal.panel.no_hearings"]()}</p>
          ) : (
            <ol className="flex list-none flex-col gap-2 p-0">
              {hearings.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', h.status === 'adjourned' || h.status === 'missed' ? 'bg-amber-500' : h.status === 'attended' ? 'bg-emerald-500' : 'bg-primary')} />
                  <span className="w-20 shrink-0 text-[0.625rem] text-muted-foreground">{formatDay(h.at)}</span>
                  <span className="text-sm">
                    {purposeLabel(h.purpose)}
                    {h.outcome ? `: ${h.outcome}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Button nativeButton={false} render={<Link to="/matters/$matterId" params={{ matterId: row.id }} />}>
          {m["criminal.panel.open_matter"]()}
        </Button>
      </div>
    </Createpanel>
  )
}

/**
 * The practice's criminal register, laid out as the client's CTMS Cases
 * module: counts by stage that filter, search and filters, a table or cards,
 * and a case panel with the remand tracker. The list leaves as Excel or as a
 * printed paper.
 */
export function CriminalRegister() {
  const { data: rows } = useCriminalRegister()
  const [stage, setStage] = useState<string>('all')
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [charge, setCharge] = useState('')
  const [custody, setCustody] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const listSheet = useRef<HTMLDivElement>(null)

  const open = rows.filter((r) => r.status === 'open')
  const years = useMemo(() => [...new Set(rows.map((r) => new Date(r.createdAt).getFullYear()))].sort((a, b) => b - a), [rows])
  const charges = useMemo(() => [...new Set(rows.map((r) => r.offence).filter(Boolean) as string[])].sort(), [rows])
  const shown = open.filter((r) => {
    if (stage !== 'all' && r.stage !== stage) return false
    const q = query.trim().toLowerCase()
    if (q && ![caseNo(r), r.clientName, r.offence ?? '', r.title].some((x) => x.toLowerCase().includes(q))) return false
    if (year && new Date(r.createdAt).getFullYear() !== Number(year)) return false
    if (charge && r.offence !== charge) return false
    if (custody && (r.custody ?? 'at_liberty') !== custody) return false
    return true
  })
  const current = rows.find((r) => r.id === openId) ?? null

  const exportCsv = () => {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [
      [m["criminal.col.case"](), m["criminal.col.accused"](), m["criminal.charge"](), m["criminal.col.stage"](), m["criminal.custody"](), m["criminal.col.remand"](), m["criminal.col.adj"](), m["criminal.col.next"]()].map(cell).join(','),
      ...shown.map((r) => {
        const c = remandClock(r)
        return [caseNo(r), r.clientName, r.offence ?? '', stageLabel(r.stage), custodyText(r.custody), c.state === 'none' || c.state === 'unknown' ? '' : String(c.days), String(r.adjournments), r.nextHearingAt ? formatDay(r.nextHearingAt) : ''].map(cell).join(',')
      }),
    ]
    // A byte-order mark so Excel reads the names' accents correctly.
    void saveFile(new TextEncoder().encode(`﻿${lines.join('\r\n')}`), 'criminal-register.csv', 'csv')
  }

  const select = 'h-8 rounded-md border border-input bg-background px-2 text-sm'

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{m["criminal.title"]()}</h1>
          <p>{m["criminal.lead"]()}</p>
        </div>
        <div className="page-actions">
          <Segmented label={m["criminal.title"]()} value={view} onChange={setView} items={[{ value: 'table', label: m["criminal.table"]() }, { value: 'cards', label: m["criminal.cards"]() }]} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="ghost" aria-label={m["mp.more"]()} title={m["mp.more"]()} className="cursor-pointer">
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={exportCsv}>{m["criminal.export"]()}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => listSheet.current && void printSheet(listSheet.current)}>{m["criminal.print"]()}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PanelButton label={m["criminal.new"]()} title={m["criminal.new"]()} description={m["criminal.lead"]()} variant="default">
            {({ close, setDirty }) => <MatterForm defaultMatterType="criminal_defence" onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[{ id: 'all', label: m["criminal.all"](), count: open.length }, ...STAGES.map((s) => ({ id: s, label: stageLabel(s), count: open.filter((r) => r.stage === s).length }))].map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setStage(stage === card.id ? 'all' : card.id)}
            aria-pressed={stage === card.id}
            className={cn('flex cursor-pointer flex-col items-start gap-1 rounded-xl border-2 px-3 py-2 text-left', stage === card.id ? 'border-primary bg-primary/5' : 'border-transparent bg-secondary/60 hover:border-border')}
          >
            <span className="text-[0.625rem] text-muted-foreground">{card.label}</span>
            <span className="text-xl font-semibold tabular-nums">{card.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-border/60 py-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m["criminal.search"]()} className="h-8 w-60" />
        <select className={select} value={year} onChange={(e) => setYear(e.target.value)} aria-label={m["criminal.year"]()}>
          <option value="">{m["criminal.all_years"]()}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select className={select} value={charge} onChange={(e) => setCharge(e.target.value)} aria-label={m["criminal.charge"]()}>
          <option value="">{m["criminal.all_charges"]()}</option>
          {charges.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={select} value={custody} onChange={(e) => setCustody(e.target.value)} aria-label={m["criminal.custody"]()}>
          <option value="">{m["criminal.all_custody"]()}</option>
          <option value="remanded">{m["criminal.remanded"]()}</option>
          <option value="at_liberty">{m["criminal.at_liberty"]()}</option>
          <option value="serving">{m["criminal.serving"]()}</option>
        </select>
        <span className="ms-auto text-xs text-muted-foreground">{m["criminal.showing"]({ count: String(shown.length) })}</span>
      </div>

      {open.length === 0 ? (
        <EmptyNote>{m["criminal.empty"]()}</EmptyNote>
      ) : view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                {[['w-32', m["criminal.col.case"]()], ['w-48', m["criminal.col.accused"]()], ['w-44', m["criminal.charge"]()], ['w-32', m["criminal.col.stage"]()], ['w-32', m["criminal.col.remand"]()], ['w-14 text-center', m["criminal.col.adj"]()], ['w-28', m["criminal.col.next"]()], ['w-20', '']].map(([w, label], i) => (
                  <th key={i} className={cn('border-b border-border/60 px-3 py-2 font-semibold', w)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b border-border/40 hover:bg-secondary/40">
                  <td className="px-3 py-2 text-xs font-semibold text-primary">{caseNo(r)}</td>
                  <td className="px-3 py-2">
                    <p className="truncate font-medium">{r.clientName}</p>
                    <p className="text-xs text-muted-foreground">{m["criminal.uganda_v"]()}</p>
                  </td>
                  <td className="truncate px-3 py-2">{r.offence ?? '...'}</td>
                  <td className="px-3 py-2">
                    <StagePill stage={r.stage} />
                  </td>
                  <td className="px-3 py-2">
                    <RemandBar row={r} />
                  </td>
                  <td className={cn('px-3 py-2 text-center font-semibold tabular-nums', r.adjournments >= 5 && 'text-amber-700 dark:text-amber-300')}>{r.adjournments}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.nextHearingAt ? formatDay(r.nextHearingAt) : m["criminal.none"]()}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenId(r.id)
                      }}
                    >
                      {m["criminal.open"]()}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border/70 p-3 text-left hover:border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">{caseNo(r)}</p>
                  <p className="truncate font-medium">{r.clientName}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.offence ?? '...'}</p>
                </div>
                <StagePill stage={r.stage} />
              </div>
              <RemandBar row={r} wide />
              <div className="flex justify-between border-t border-border/50 pt-2 text-[0.625rem] text-muted-foreground">
                <span>
                  {m["criminal.col.next"]()}: {r.nextHearingAt ? formatDay(r.nextHearingAt) : m["criminal.none"]()}
                </span>
                <span>
                  {r.adjournments} {m["criminal.col.adj"]()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* The list as a paper, off screen until printed. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0 w-[210mm]" aria-hidden>
        <PaperSheet ref={listSheet} title={m["criminal.title"]()}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {[m["criminal.col.case"](), m["criminal.col.accused"](), m["criminal.charge"](), m["criminal.col.stage"](), m["criminal.col.remand"](), m["criminal.col.adj"](), m["criminal.col.next"]()].map((h) => (
                  <th key={h} className="border-b border-black px-1 py-1 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const c = remandClock(r)
                return (
                  <tr key={r.id}>
                    <td className="border-b border-zinc-300 px-1 py-1">{caseNo(r)}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{r.clientName}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{r.offence ?? ''}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{stageLabel(r.stage)}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{c.state === 'none' || c.state === 'unknown' ? custodyText(r.custody) : `${c.days}`}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{r.adjournments}</td>
                    <td className="border-b border-zinc-300 px-1 py-1">{r.nextHearingAt ? formatDay(r.nextHearingAt) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </PaperSheet>
      </div>

      {current && <CasePanel key={current.id} row={current} onClose={() => setOpenId(null)} />}
    </>
  )
}
