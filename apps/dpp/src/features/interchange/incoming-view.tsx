import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon } from '@hugeicons/core-free-icons'
import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { saveFile } from './data'
import { ClockChip, KindChip, kindBarColour, kindWord } from '@/components/file-chips'
import { useClocks } from '@/features/clocks'
import { useAttention } from '@/features/attention'
import { fileReference, useFiles, type FileSummary } from '@/features/prosecution-files'
import { ageLabel, plural } from '@/lib/present'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { PanelButton } from '@/components/add-panel'
import { ProsecutionFileForm } from '@/features/prosecution-files'
import { ImportButton } from './import-button'
import { InboxPreview } from './inbox-preview'
import { useIncoming, useOutgoing } from './queries'
import { outgoingKindLabels, type IncomingSummary, type Outgoing } from './schema'
import * as m from '@/paraglide/messages'

function OutgoingRow({ item }: { item: Outgoing }) {
  const save = useMutation({
    mutationFn: () => saveFile('outgoing', item.id),
    onSuccess: (saved) => saved && t.success(m["interchange.out.saved"]()),
    onError: (e) => t.error(m["interchange.out.save_failed"](), { description: e instanceof ApiError ? e.message : typeof e === 'string' ? e : m["common.try_again"]() }),
  })
  return (
    <Row
      title={`${outgoingKindLabels[item.kind] ?? item.kind}: ${item.summary.replace(/^[^:]+: /, '')}`}
      summary={`${m["interchange.out.to"]({ station: item.stationName ?? m["interchange.a_station"]() })}${item.policeReference ? `. ${item.policeReference}` : ''}. ${m["interchange.out.prepared"]({ date: formatDate(item.preparedAt, 'datetime') })}${item.exportedAt ? `. ${m["interchange.out.saved_on"]({ date: formatDate(item.exportedAt, 'datetime') })}` : ''}.`}
      trailing={
        <>
          <Tag tone={item.exportedAt ? 'done' : 'open'}>{item.exportedAt ? m["interchange.out.saved_to_send"]() : m["interchange.out.not_sent"]()}</Tag>
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            {item.exportedAt ? m["interchange.out.save_again"]() : m["interchange.out.save"]()}
          </Button>
        </>
      }
    />
  )
}

type InboxTab = 'all' | 'police' | 'returned' | 'court' | 'complaint'
const inboxTabs: InboxTab[] = ['all', 'police', 'returned', 'court', 'complaint']
type InboxItem = {
  key: string
  tab: InboxTab
  kind: string
  kindLabel: string
  title: string
  sub: string
  clock: { urgent: boolean; label: string }
  at: number
  urgent?: boolean
  package?: IncomingSummary
  file?: FileSummary
  from: string
  ref: string
  accused: string
  offence: string
  papers: string
}

/** What has arrived from stations, waiting to be read, and what this office has
 * prepared to send back. Nothing that arrives is a record until it is accepted. */
export function IncomingView() {
  const { data: incoming } = useIncoming()
  const { data: outgoing } = useOutgoing()
  const { data: files } = useFiles('all')
  const { data: clocks = [] } = useClocks()
  const { forFile } = useAttention()
  const navigate = useNavigate()
  const [tab, setTab] = useState<InboxTab>('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const waiting = incoming.filter((p) => p.status === 'received')
  const decided = incoming.filter((p) => p.status !== 'received')
  const toSend = outgoing.filter((o) => o.kind !== 'pairing_confirmation' && !o.exportedAt)
  const confirmations = outgoing.filter((o) => o.kind === 'pairing_confirmation' && !o.exportedAt)

  // Everything the office has to take in: packages from stations not yet read,
  // files that arrived and have not been gone through, and complaints.
  const items: InboxItem[] = [
    ...waiting.map<InboxItem>((p) => ({
      key: `package:${p.id}`,
      tab: p.resubmission ? 'returned' : 'police',
      kind: 'perusal',
      kindLabel: p.resubmission ? m["inbox.kind.returned"]() : m["inbox.kind.police_file"](),
      title: p.policeReference ?? m["interchange.referral"](),
      sub: m["interchange.in.from_received"]({ station: p.stationName ?? m["interchange.a_station"](), date: formatDate(p.receivedAt, 'datetime') }),
      clock: { urgent: false, label: m["inbox.waiting"]({ age: ageLabel(p.receivedAt).toLowerCase() }) },
      at: p.receivedAt,
      package: p,
      from: p.stationName ?? '',
      ref: p.policeReference ?? '',
      accused: '',
      offence: '',
      papers: '',
    })),
    ...files
      .filter((f) => f.stage === 'receive' || f.currentStatus === 'resubmitted' || (f.kind === 'complaint' && f.stage !== 'concluded'))
      .map<InboxItem>((f) => {
        const c = clocks.find((x) => x.fileId === f.id && x.dueAt != null)
        // Whether it needs this person is the backend's one answer, the same as on Today and Files.
        const urgent = forFile(f.id)?.needsMe ?? false
        const returned = f.currentStatus === 'resubmitted'
        return {
          key: `file:${f.id}`,
          tab: f.kind === 'complaint' ? 'complaint' : returned ? 'returned' : f.kind === 'perusal' ? 'police' : 'court',
          kind: f.kind,
          kindLabel: returned ? m["inbox.kind.returned"]() : f.kind === 'perusal' ? m["inbox.kind.police_file"]() : kindWord(f.kind),
          title: f.title,
          sub: [fileReference(f), f.policeStation, plural(f.statementCount, m["count.statement.one"], m["count.statement.many"])].filter(Boolean).join(' · '),
          clock: c?.dueAt != null ? { urgent, label: c.overdue ? m["files.clock.overdue"]({ what: c.kind === 'allocation' ? m["files.clock.allocate"]() : m["files.clock.reply"]() }) : m["files.clock.in_days"]({ what: c.kind === 'allocation' ? m["files.clock.allocate"]() : m["files.clock.reply"](), days: Math.ceil((c.dueAt - Date.now()) / 86_400_000) }) } : { urgent: false, label: m["inbox.waiting"]({ age: ageLabel(f.awaitingSince).toLowerCase() }) },
          at: f.awaitingSince,
          file: f,
          urgent,
          from: f.policeStation ?? '',
          ref: fileReference(f) ?? '',
          accused: f.accused ?? '',
          offence: f.offence ?? '',
          papers: String(f.statementCount),
        }
      }),
  ]
  const q = query.trim().toLowerCase()
  const visible = items.filter((i) => (tab === 'all' || i.tab === tab) && (!q || `${i.title} ${i.sub}`.toLowerCase().includes(q)))
  const today = visible.filter((i) => i.urgent)
  const rest = visible.filter((i) => !i.urgent).sort((a, b) => a.at - b.at)
  const counts: Record<InboxTab, number> = { all: items.length, police: items.filter((i) => i.tab === 'police').length, returned: items.filter((i) => i.tab === 'returned').length, court: items.filter((i) => i.tab === 'court').length, complaint: items.filter((i) => i.tab === 'complaint').length }
  const selected = items.find((i) => i.key === picked) ?? today[0] ?? rest[0] ?? null


  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.inbox"]()}</h1>
          <p>{m["inbox.subtitle"]({ count: items.length, urgent: items.filter((i) => i.urgent).length })}</p>
        </div>
        <div className="page-actions">
          <ImportButton onImported={(o) => o.packageId && void navigate({ to: '/incoming/$packageId', params: { packageId: o.packageId } })} />
          <PanelButton label={m["interchange.in.paper_arrived"]()} title={m["interchange.in.paper_arrived"]()} description={m["interchange.in.paper_arrived_desc"]()} variant="secondary">
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

      <nav className="flex flex-wrap gap-1.5" aria-label={m["nav.item.inbox"]()}>
        {inboxTabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined} className={cn('cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm', tab === t ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:bg-secondary')}>
            {m[`inbox.tab.${t}`]()} {counts[t]}
          </button>
        ))}
      </nav>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m["inbox.search"]()} aria-label={m["inbox.search"]()} className="h-10 w-full rounded-[10px] border-0 bg-secondary px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="min-w-0 overflow-x-auto">
          {visible.length === 0 ? (
            <EmptyNote icon={<HugeiconsIcon icon={InboxIcon} />}>{items.length > 0 ? m["interchange.in.no_match"]() : m["interchange.in.empty"]()}</EmptyNote>
          ) : (
            <div className="flex flex-col gap-5">
              {([
                ['today', m["inbox.group.today"](), today],
                ['waiting', m["inbox.group.waiting"](), rest],
              ] as const).map(([key, label, rows]) =>
                rows.length === 0 ? null : (
                  <div key={key}>
                    <h2 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {label} · {rows.length}
                    </h2>
                    <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-border/70 p-0">
                      {rows.map((i) => (
                        <li key={i.key} className="border-b border-border/60 last:border-b-0">
                          <button
                            type="button"
                            aria-current={selected?.key === i.key ? 'true' : undefined}
                            onClick={() => setPicked(i.key)}
                            className={cn('flex w-full cursor-pointer items-start justify-between gap-4 py-3 pr-3 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40', selected?.key === i.key ? 'bg-primary/10' : 'hover:bg-secondary/60')}
                            style={{ borderLeft: `4px solid ${kindBarColour[i.kind] ?? '#d2d2d7'}` }}
                          >
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{i.title}</span>
                                <KindChip kind={i.kind} label={i.kindLabel} />
                              </span>
                              <span className="mt-0.5 block text-[13px] text-muted-foreground">
                                {[i.accused, i.offence, i.from].filter(Boolean).join(' · ') || i.sub}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                              <ClockChip urgent={i.clock.urgent}>{i.clock.label}</ClockChip>
                              {i.papers && <span className="text-xs text-muted-foreground">{plural(Number(i.papers), m["count.statement.one"], m["count.statement.many"])}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
        {selected && <InboxPreview item={selected} />}
      </div>

      {/* Only when there is something to send: an empty outbox says nothing. */}
      {outgoing.length > 0 && (
      <section className="page-section">
        <div className="section-head">
          <h2>{m["interchange.in.to_send"]()}</h2>
          {toSend.length + confirmations.length > 0 && <Tag tone="open">{toSend.length + confirmations.length}</Tag>}
        </div>
        <p>{m["interchange.in.to_send_hint"]()}</p>
        {outgoing.length === 0 ? (
          <EmptyNote>{m["interchange.in.nothing_prepared"]()}</EmptyNote>
        ) : (
          <RowList>
            {outgoing.map((o) => (
              <OutgoingRow key={o.id} item={o} />
            ))}
          </RowList>
        )}
      </section>
      )}

      {decided.length > 0 && (
        <section className="page-section">
          <h2>{m["interchange.in.decided"]()}</h2>
          <RowList>
            {decided.map((p) => (
              <Row
                key={p.id}
                title={p.policeReference ?? m["interchange.referral"]()}
                summary={`${m["interchange.in.from"]({ station: p.stationName ?? m["interchange.a_station"]() })} ${p.status === 'accepted' ? m["interchange.status.accepted"]() : m["interchange.status.rejected"]()} ${p.decidedAt ? formatDate(p.decidedAt) : ''}${p.decidedBy ? `, ${p.decidedBy}` : ''}${p.rejectReason ? `. ${p.rejectReason}` : ''}.`}
                trailing={
                  <>
                    <Tag tone={p.status === 'accepted' ? 'done' : 'stopped'}>{p.status === 'accepted' ? m["interchange.status.accepted"]() : m["interchange.status.rejected"]()}</Tag>
                    {p.prosecutionFileId ? (
                      <Link to="/files/$fileId" params={{ fileId: p.prosecutionFileId }} className="text-primary">{m["interchange.open_file"]()}</Link>
                    ) : (
                      <Link to="/incoming/$packageId" params={{ packageId: p.id }} className="text-primary">{m["interchange.read"]()}</Link>
                    )}
                  </>
                }
              />
            ))}
          </RowList>
        </section>
      )}
    </article>
  )
}
