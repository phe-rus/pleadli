import { formatDate } from '@/lib/dates'
import { useJurisdiction } from '@/features/installation'
import { useSecurityStatus } from '@/features/security'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { useEffect, useState } from 'react'
import type { Offence, OffenceInput } from './data'
import { useArchiveOffence, useCreateOffence, useGuide, useRestoreStarter, useRestoreVersion, useUpdateOffence, useVersions } from './queries'

const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
const blank = (o: Offence | null) => ({
  title: o?.title ?? '',
  sectionRefs: o?.sectionRefs ?? '',
  chargeWording: o?.chargeWording ?? '',
  particularsTemplate: o?.particularsTemplate ?? '',
  proving: (o?.proving ?? []).join('\n'),
  papers: (o?.papers ?? []).join('\n'),
  gaps: (o?.gaps ?? []).join('\n'),
  words: (o?.words ?? []).join('\n'),
  waiting: o?.state === 'waiting_for_director',
})

function Box({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  )
}

function Editor({ offence, country, canEdit, onGone }: { offence: Offence | null; country: string; canEdit: boolean; onGone: () => void }) {
  const [f, setF] = useState(blank(offence))
  useEffect(() => setF(blank(offence)), [offence?.id, offence?.updatedAt])
  const create = useCreateOffence()
  const update = useUpdateOffence()
  const archive = useArchiveOffence()
  const restoreStarter = useRestoreStarter()
  const restoreVersion = useRestoreVersion()
  const { data: versions = [] } = useVersions(offence?.id ?? null)
  const [tab, setTab] = useState<'details' | 'proving' | 'papers' | 'gaps' | 'words' | 'history'>('details')
  const n = (v: string) => lines(v).length
  const tabs: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'details', label: m["guide.tab_details"]() },
    { id: 'proving', label: m["guide.tab_proving"](), count: n(f.proving) },
    { id: 'papers', label: m["guide.tab_papers"](), count: n(f.papers) },
    { id: 'gaps', label: m["guide.tab_gaps"](), count: n(f.gaps) },
    { id: 'words', label: m["guide.tab_words"](), count: n(f.words) },
    ...(offence ? [{ id: 'history' as const, label: m["guide.tab_history"](), count: versions.length }] : []),
  ]
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  const input: OffenceInput = {
    jurisdiction: country,
    title: f.title,
    sectionRefs: f.sectionRefs || null,
    chargeWording: f.chargeWording || null,
    particularsTemplate: f.particularsTemplate || null,
    proving: lines(f.proving),
    papers: lines(f.papers),
    gaps: lines(f.gaps),
    words: lines(f.words),
    state: f.waiting ? 'waiting_for_director' : 'in_use',
  }
  const error = (create.error ?? update.error ?? restoreStarter.error ?? restoreVersion.error) as Error | null
  const saving = create.isPending || update.isPending
  const dirty = JSON.stringify(f) !== JSON.stringify(blank(offence))

  return (
    <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4 border-0 p-0">
      {offence && (
        <header className="not-typeset flex flex-col gap-1">
          <h2 className="m-0 text-xl font-semibold">{offence.title}</h2>
          <dl className="m-0 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-y-0.5 text-sm">
            {offence.sectionRefs && (<><dt className="m-0 font-medium text-muted-foreground">{m["guide.k_section"]()}</dt><dd className="m-0">{offence.sectionRefs}</dd></>)}
            <dt className="m-0 font-medium text-muted-foreground">{m["guide.k_source"]()}</dt>
            <dd className="m-0">{offence.source === 'starter' ? m["guide.from_app"]() : m["guide.from_office"]({ who: offence.updatedBy ?? '', date: formatDate(offence.updatedAt, 'datetime') })}</dd>
          </dl>
        </header>
      )}
      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border/60">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('relative h-9 cursor-pointer px-3 text-sm outline-none transition-colors', tab === t.id ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.label}
            {t.count != null && <span className="ms-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'details' && (<>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Box label={m["guide.offence"]()}>
          <Input value={f.title} onChange={(e) => set('title')(e.target.value)} />
        </Box>
        <Box label={m["guide.sections"]()}>
          <Input value={f.sectionRefs} onChange={(e) => set('sectionRefs')(e.target.value)} placeholder="254, 261" />
        </Box>
      </div>
      <Box label={m["guide.charge_wording"]()} hint={m["guide.charge_wording_hint"]()}>
        <Textarea value={f.chargeWording} onChange={(e) => set('chargeWording')(e.target.value)} className="field-sizing-content min-h-16" />
      </Box>
      <Box label={m["guide.particulars"]()} hint={m["guide.particulars_hint"]()}>
        <Textarea value={f.particularsTemplate} onChange={(e) => set('particularsTemplate')(e.target.value)} className="field-sizing-content min-h-20" />
      </Box>
      </>)}
      {(['proving', 'papers', 'gaps', 'words'] as const).map((k) => tab === k && (
        <Box key={k} label={m[`guide.${k}`]()} hint={m["guide.one_per_line"]()}>
          <Textarea value={f[k]} onChange={(e) => set(k)(e.target.value)} className="field-sizing-content min-h-48" />
        </Box>
      ))}
      {tab === 'history' && <History offenceId={offence?.id ?? null} />}
      {tab === 'details' && <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={f.waiting} onChange={(e) => set('waiting')(e.target.checked)} />
        {m["guide.waiting"]()}
      </label>}
      {error && <p className="not-typeset text-destructive">{error.message}</p>}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background px-1 py-3">
        <div className="flex items-center gap-2">
          {dirty && canEdit && <span className="text-sm text-muted-foreground">{m["guide.unsaved"]()}</span>}
          {offence?.starterKey && offence.source === 'office' && (
            <Button variant="secondary" size="sm" disabled={restoreStarter.isPending} onClick={() => restoreStarter.mutate(offence.id)}>
              {m["guide.restore_starter"]()}
            </Button>
          )}
          {offence && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => archive.mutate(offence.id, { onSuccess: onGone })}>
              {m["guide.remove"]()}
            </Button>
          )}
        </div>
        <Button
          disabled={!f.title.trim() || saving || (!!offence && !dirty)}
          onClick={() => (offence ? update.mutate({ id: offence.id, input }) : create.mutate(input, { onSuccess: onGone }))}
        >
          {m["guide.save"]()}
        </Button>
      </div>

    </fieldset>
  )
}

function History({ offenceId }: { offenceId: string | null }) {
  const { data: versions = [] } = useVersions(offenceId)
  const restoreVersion = useRestoreVersion()
  if (versions.length === 0) return <p className="text-muted-foreground">{m["guide.history"]()}: 0</p>
  return (
    <ul className="flex list-none flex-col gap-1 p-0">
      {versions.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
          <span className="min-w-0 truncate text-sm">
            {formatDate(v.changedAt, 'datetime')} · {v.changedBy ?? '?'}
            {v.note ? ` · ${v.note}` : ''}
            <span className="ml-2 text-muted-foreground">{String(v.snapshot.chargeWording ?? v.snapshot.title ?? '')}</span>
          </span>
          <Button size="xs" variant="ghost" disabled={restoreVersion.isPending} onClick={() => restoreVersion.mutate(v.id)}>
            {m["guide.put_back"]()}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** The legal guide, edited in plain words by the office. The Decide step, the
 * charge wording and Assist's context read from what is here. */
export function GuidePane() {
  const country = useJurisdiction()
  const { data: offences = [] } = useGuide(country?.code)
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const { data: status } = useSecurityStatus()
  const canEdit = status?.actor?.role === 'administrator'
  const [query, setQuery] = useState('')
  const current = offences.find((o) => o.id === selected) ?? null
  const q = query.trim().toLowerCase()
  const shown = q ? offences.filter((o) => `${o.title} ${o.sectionRefs ?? ''}`.toLowerCase().includes(q)) : offences
  if (!country) return null
  return (
    <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1 md:sticky md:top-2 md:max-h-[calc(100vh-9rem)] md:self-start">
        {!canEdit && <p className="mb-2 text-sm text-muted-foreground">{m["guide.admin_only"]()}</p>}
        <Button size="sm" variant="secondary" disabled={!canEdit} onClick={() => setSelected('new')}>
          {m["guide.add"]()}
        </Button>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m["guide.search"]()} aria-label={m["guide.search"]()} className="mt-1" />
        <ul className="mt-2 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto p-0">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setSelected(o.id)}
                aria-current={selected === o.id ? 'true' : undefined}
                className={cn('flex w-full cursor-pointer flex-col rounded-lg border-l-4 border-transparent px-3 py-2 text-left transition-colors hover:bg-secondary/60', selected === o.id && 'border-primary bg-primary/10')}
              >
                <span className="font-medium">{o.title}</span>
                <span className="text-xs text-muted-foreground">
                  {[o.sectionRefs ? m["guide.section_short"]({ refs: o.sectionRefs }) : null, o.state === 'waiting_for_director' ? m["guide.waiting_short"]() : null].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {offences.length === 0 && <li className="px-3 py-2 text-muted-foreground">{m["guide.empty"]()}</li>}
          {offences.length > 0 && shown.length === 0 && <li className="px-3 py-2 text-muted-foreground">{m["guide.no_match"]()}</li>}
        </ul>
      </div>
      <div className="min-w-0">
        {selected === 'new' && <Editor offence={null} country={country.code} canEdit={canEdit} onGone={() => setSelected(null)} />}
        {selected && selected !== 'new' && current && <Editor key={current.id} offence={current} country={country.code} canEdit={canEdit} onGone={() => setSelected(null)} />}
        {!selected && <p className="text-muted-foreground">{m["guide.pick"]()}</p>}
      </div>
    </div>
  )
}
