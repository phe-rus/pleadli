import { ClockChip, KindChip } from '@/components/file-chips'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { useClocks, type OfficeClock } from '@/features/clocks'
import { useCalendar } from '@/features/court/queries'
import { fileReference, filesOptions, isFileView, ProsecutionFileForm, useFiles, type FileSummary, type FileViewId } from '@/features/prosecution-files'
import { actionLabel, holderLabel, obligationLabel, stepWord, useAttention } from '@/features/attention'
import { FileStatusTag } from '@/components/status-tag'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Folder01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/files/')({
  validateSearch: (search: Record<string, unknown>): { view?: FileViewId; open?: string; layout?: 'list' | 'board' } => ({
    ...(isFileView(search.view) ? { view: search.view } : {}),
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...filesOptions('all'), staleTime: 'static' })
  },
  component: RouteComponent,
})

const DAY = 86_400_000
const tabs = ['all', 'perusal', 'court', 'application', 'appeal', 'revision', 'complaint', 'closed'] as const
type Tab = (typeof tabs)[number]

const tabLabel = (t: Tab) =>
  ({ all: m["files.tab.all"], perusal: m["files.tab.perusal"], court: m["files.tab.court"], application: m["files.tab.application"], appeal: m["files.tab.appeal"], revision: m["files.tab.revision"], complaint: m["files.tab.complaint"], closed: m["files.tab.closed"] })[t]()

const inTab = (f: FileSummary, tab: Tab) => {
  const open = f.stage !== 'concluded'
  switch (tab) {
    case 'all': return open
    case 'closed': return !open
    case 'court': return open && f.stage === 'follow_up'
    default: return open && f.kind === tab
  }
}


const inDays = (at: number) => Math.ceil((at - Date.now()) / DAY)

function clockFor(f: FileSummary, clocks: OfficeClock[], hearing: number | undefined) {
  const c = clocks.find((x) => x.fileId === f.id)
  if (c?.kind === 'adjournment_review') return { urgent: true, label: m["files.clock.review_now"]() }
  if (c?.dueAt != null) {
    const d = inDays(c.dueAt)
    const word = c.kind === 'allocation' ? m["files.clock.allocate"] : m["files.clock.reply"]
    return d < 0 ? { urgent: true, label: m["files.clock.overdue"]({ what: word() }) } : { urgent: d <= 1, label: m["files.clock.in_days"]({ what: word(), days: d }) }
  }
  if (hearing != null) return { urgent: inDays(hearing) <= 1, label: formatDate(hearing, 'weekday') }
  return null
}

/** Obligations that are the stage's own step; anything else (a hearing, a limit, a task) leads the Next step column when it is the person's. */
const stageKinds = ['allocate', 'read', 'decide', 'director_decision', 'prepare', 'send']

function RouteComponent() {
  const { view, open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: files } = useFiles('all')
  const { data: clocks = [] } = useClocks()
  const [from] = useState(() => Date.now())
  const { data: calendar = [] } = useCalendar(from, from + 90 * DAY)
  const { forFile } = useAttention()

  // "Mine" is the backend's answer: held by me or needing me, never a second rule here.
  const isMine = (id: string) => { const n = forFile(id); return !!n && n.action !== 'closed' && (n.heldByMe || n.needsMe) }
  const mineCount = files.filter((f) => isMine(f.id)).length
  const [scope, setScope] = useState<'mine' | 'office' | null>(null)
  const mine = (scope ?? (mineCount > 0 ? 'mine' : 'office')) === 'mine'
  const initialTab: Tab = view?.startsWith('kind_') ? (view.slice(5) as Tab) : view === 'closed' || view === 'concluded' ? 'closed' : view === 'follow_up' ? 'court' : 'all'
  const [tab, setTab] = useState<Tab>(tabs.includes(initialTab) ? initialTab : 'all')
  const [query, setQuery] = useState('')
  // A stage link from elsewhere (Today, search) narrows the list to that stage.
  const stage = view && ['receive', 'review', 'decide', 'prepare', 'handover'].includes(view) ? view : null

  useEffect(() => {
    if (open) void navigate({ to: '/files/$fileId', params: { fileId: open }, replace: true })
  }, [open, navigate])

  const nextHearing = useMemo(() => {
    const byFile = new Map<string, number>()
    for (const e of calendar) if (e.source === 'hearing' && e.fileId && e.at >= from && !byFile.has(e.fileId)) byFile.set(e.fileId, e.at)
    return byFile
  }, [calendar, from])

  const scoped = files.filter((f) => !mine || isMine(f.id))
  const counts = Object.fromEntries(tabs.map((t) => [t, scoped.filter((f) => inTab(f, t)).length])) as Record<Tab, number>
  const q = query.trim().toLowerCase()
  const rows = scoped
    .filter((f) => inTab(f, tab) && (!stage || f.stage === stage) && (!q || [f.title, fileReference(f), f.accused, f.policeStation, f.courtCaseNumber].filter(Boolean).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (nextHearing.get(a.id) ?? Infinity) - (nextHearing.get(b.id) ?? Infinity) || b.lastActivityAt - a.lastActivityAt)
  const openCount = files.filter((f) => f.stage !== 'concluded').length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.files"]()}</h1>
          <p>{m["files.subtitle"]({ open: openCount, mine: mineCount })}</p>
        </div>
        <div className="page-actions">
          <div role="radiogroup" aria-label={m["files.scope.label"]()} className="flex rounded-[10px] bg-secondary p-[3px]">
            {([['mine', m["files.scope.mine"]({ count: mineCount })], ['office', m["files.scope.office"]({ count: openCount })]] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={(id === 'mine') === mine} onClick={() => setScope(id)} className={cn('cursor-pointer rounded-lg px-3.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50', (id === 'mine') === mine ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <PanelButton label={m["workspace.quick.open_file"]()} title={m["workspace.quick.open_file"]()} description={m["workspace.quick.open_file_description"]()} variant="default">
            {({ close, setDirty }) => (
              <ProsecutionFileForm
                onDirtyChange={setDirty}
                onSuccess={(file) => {
                  close()
                  void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      <nav aria-label={m["nav.item.files"]()} className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined} className={cn('cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50', tab === t ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:bg-secondary')}>
            {tabLabel(t)}
            {t !== 'closed' && t !== 'all' ? ` ${counts[t]}` : ''}
          </button>
        ))}
      </nav>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={m["files.search"]()}
        aria-label={m["files.search"]()}
        className="h-10 w-full rounded-[10px] border-0 bg-secondary px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      {rows.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Folder01Icon} />}>{m["page.files.empty"]()}</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
        <div role="table" aria-label={m["nav.item.files"]()} className="flex min-w-[44rem] flex-col">
          <div role="row" className="flex gap-3.5 border-b border-border px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
            <div className="flex-[2.4_1_0]">{m["files.col.file"]()}</div>
            <div className="flex-[1.1_1_0]">{m["files.col.kind"]()}</div>
            <div className="flex-[1.1_1_0]">{m["files.col.stage"]()}</div>
            <div className="flex-[1.9_1_0]">{m["files.col.next"]()}</div>
            <div className="flex-[1.2_1_0] text-right">{m["files.col.clock"]()}</div>
          </div>
          {rows.map((f) => {
            const clock = clockFor(f, clocks, nextHearing.get(f.id))
            const next = forFile(f.id)
            return (
              <Link key={f.id} to="/files/$fileId" params={{ fileId: f.id }} role="row" className="flex items-center gap-3.5 border-b border-border/60 px-3 py-3 text-foreground no-underline outline-none hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
                <div className="min-w-0 flex-[2.4_1_0]">
                  <div className="truncate text-[15px] font-semibold" title={f.title}>{f.title}</div>
                  <div className="truncate text-[13px] text-muted-foreground">{[f.accused, fileReference(f)].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="min-w-0 flex-[1.1_1_0]">
                  <KindChip kind={f.kind} />
                </div>
                <div className="flex min-w-0 flex-[1.1_1_0] flex-col items-start gap-1 text-[13px]">
                  {next ? stepWord(next) : ''}
                  {!['under_review', 'resubmitted'].includes(f.currentStatus) && <FileStatusTag status={f.currentStatus} stage={f.stage} />}
                </div>
                <div className="min-w-0 flex-[1.9_1_0] text-[13px] text-muted-foreground">
                  {next ? (next.primary?.mine && !stageKinds.includes(next.primary.kind) ? obligationLabel(next.primary) : actionLabel(next)) : ''}
                  {next && next.obligations.filter((o) => o.mine).length > 1 && <span className="block text-xs">{m['attn.and_more']({ count: next.obligations.filter((o) => o.mine).length - 1 })}</span>}
                  {next && !next.needsMe && next.action !== 'closed' && <span className="block text-xs">{holderLabel(next)}</span>}
                </div>
                <div className="min-w-0 flex-[1.2_1_0] text-right">{clock && <ClockChip urgent={clock.urgent}>{clock.label}</ClockChip>}</div>
              </Link>
            )
          })}
        </div>
        </div>
      )}
      <p className="max-w-3xl text-[13px] text-muted-foreground">{m["files.footnote"]()}</p>
    </article>
  )
}
