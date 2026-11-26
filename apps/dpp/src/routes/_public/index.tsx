import { PanelButton } from '@/components/add-panel'
import { clockSentence, computeClocks, urgent, useCustody } from '@/features/custody'
import { useClocks } from '@/features/clocks'
import { useCalendar } from '@/features/court/queries'
import { useJurisdiction } from '@/features/installation'
import { filesOptions, fileReference, ProsecutionFileForm, useFiles } from '@/features/prosecution-files'
import { useSecurityStatus } from '@/features/security'
import { useWorkload, workloadOptions } from '@/features/workload'
import { tabTitle } from '@/features/workspace/tab-identity'
import { formatDate } from '@/lib/dates'
import { packText } from '@/lib/jurisdiction'
import { plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { useWorkspace } from '@pleadli/shell'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useBoard } from '@/features/pipeline'
import { actionLabel, actionRank, holderLabel, useAttention, verbLabel } from '@/features/attention'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { useState, type ReactNode } from 'react'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    const { queryClient } = context
    await Promise.all([
      queryClient.query({ ...workloadOptions(), staleTime: 'static' }),
      queryClient.query({ ...filesOptions('all'), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

const DAY = 86_400_000

type Line = { key: string; to: string; fileId?: string; dot?: string; title: string; detail: string; action?: string; lead?: ReactNode }

function Card({ title, tone, lines, empty }: { title: string; tone?: 'attention'; lines: Line[]; empty: string }) {
  return (
    <section className={cn('flex min-w-0 flex-1 basis-80 flex-col gap-1.5 rounded-[18px] px-[22px] py-5', tone === 'attention' ? 'border border-[#f4d9c3] bg-[#fff7f0] dark:border-[#9a3a00]/40 dark:bg-[#9a3a00]/10' : 'bg-secondary/60')}>
      <h2 className={cn('text-xs font-semibold tracking-wide', tone === 'attention' ? 'text-[#9a3a00] dark:text-[#ffd9b8]' : 'text-muted-foreground')}>{title}</h2>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        lines.map((l, i) => (
          <Link key={l.key} to="/files/$fileId" params={{ fileId: l.fileId ?? '' }} className={cn('flex items-center gap-3 py-[11px] text-foreground no-underline', i > 0 && 'border-t border-border/70')}>
            {l.lead ?? <span className="size-[9px] shrink-0 rounded-full" style={{ background: l.dot ?? '#8a8a90' }} />}
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{l.title}</span>
              <span className="block text-[13px] text-muted-foreground">{l.detail}</span>
            </span>
            {l.action && <span className="rounded-[9px] bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground">{l.action}</span>}
          </Link>
        ))
      )}
    </section>
  )
}

/** Today: what needs the prosecutor, in the order the day goes. It lists
 * nothing of its own: every line is a file, and opening it puts you in that
 * file with its papers, history and next step. */
function RouteComponent() {
  const navigate = useNavigate()
  const country = useJurisdiction()
  const { data: workload } = useWorkload()
  const { data: files } = useFiles('all')
  const { items, forFile } = useAttention()
  const { data: custody = [] } = useCustody()
  const { data: board = [] } = useBoard()
  const { data: clocks = [] } = useClocks()
  const { data: status } = useSecurityStatus()
  const { recents } = useWorkspace()
  const [from] = useState(() => Date.now())
  const { data: calendar = [] } = useCalendar(from, from + 7 * DAY)

  const first = status?.actor?.name ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? m["today.morning"]({ name: first }) : hour < 18 ? m["today.afternoon"]({ name: first }) : m["today.evening"]({ name: first })

  // The legal clocks that have run out or are about to come first: nothing on
  // this page matters more than an unlawful detention.
  const custodyLines: Line[] = board.flatMap((card) =>
    urgent(computeClocks(custody.filter((e) => e.prosecutionFileId === card.id), country)).map((clock, i) => ({
      key: `custody:${card.id}:${i}`,
      fileId: card.id,
      to: 'case',
      dot: '#e0661a',
      title: `${card.title}${clock.person ? `, ${clock.person}` : ''}`,
      detail: `${packText(clock.limit.label)}: ${clockSentence(clock)}`,
      action: m["today.open"](),
    })),
  )
  // Who needs what is decided once, in the backend (attention.rs). This page,
  // the Files list, the Inbox and the status bar all read that one answer.
  const titleOf = new Map(files.map((f) => [f.id, f]))
  const mineLines = items
    .filter((n) => n.needsMe && n.action !== 'closed' && !custodyLines.some((c) => c.fileId === n.fileId))
    .sort((x, y) => Number(y.overdue) - Number(x.overdue) || actionRank[x.action] - actionRank[y.action])
  const decideLines: Line[] = [
    ...custodyLines,
    ...mineLines.map<Line>((n) => {
      const f = titleOf.get(n.fileId)
      return {
        key: `needs:${n.fileId}`,
        fileId: n.fileId,
        to: 'case',
        dot: n.overdue ? '#e0661a' : n.action === 'decide' ? '#e0661a' : '#8a8a90',
        title: f?.title ?? '',
        detail: [actionLabel(n), f ? fileReference(f) : null, n.overdue && n.dueAt ? m['today.deadline.overdue']({ date: formatDate(n.dueAt) }) : null].filter(Boolean).join(' · '),
        action: verbLabel(n),
      }
    }),
  ]

  const courtLines: Line[] = calendar
    .filter((e) => e.source === 'hearing' && e.fileId)
    .map((e) => ({
      key: `hearing:${e.id}`,
      fileId: e.fileId ?? undefined,
      to: 'file',
      title: e.fileTitle ?? e.title,
      detail: e.detail ?? e.title,
      lead: (
        <span className="w-[52px] shrink-0 text-[13px] font-semibold leading-snug">
          {formatDate(e.at, 'weekday')}
          <span className="block font-normal text-muted-foreground">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </span>
      ),
    }))

  const onMyList = new Set(mineLines.map((n) => n.fileId))
  const deadlineLines: Line[] = [
    ...clocks.filter((c) => !(c.kind === 'allocation' && onMyList.has(c.fileId))).map<Line>((c) => ({
      key: `clock:${c.fileId}:${c.kind}`,
      fileId: c.fileId,
      to: 'file',
      dot: '#0071e3',
      title: `${c.kind === 'allocation' ? m["today.deadline.allocation"]() : c.kind === 'complaint_reply' ? m["today.deadline.reply"]() : m["today.deadline.review"]()}, ${c.fileTitle}`,
      detail:
        c.kind === 'adjournment_review'
          ? m["today.deadline.adjournments"]({ count: c.count ?? 0 })
          : c.overdue
            ? m["today.deadline.overdue"]({ date: formatDate(c.dueAt ?? 0) })
            : m["today.deadline.due_in"]({ days: Math.max(0, differenceInCalendarDays(c.dueAt ?? 0, new Date())) }),
    })),
    ...workload.thresholdReviews.map<Line>((r) => {
      const days = differenceInCalendarDays(r.dueAt, new Date())
      return { key: `threshold:${r.fileId}`, fileId: r.fileId, to: 'file', dot: '#0071e3', title: `${m["today.deadline.threshold"]()}, ${r.fileTitle}`, detail: days < 0 ? m["overview.attention.threshold_overdue"]({ date: formatDate(r.dueAt) }) : m["overview.attention.threshold_due"]({ date: formatDate(r.dueAt), left: `${days}` }) }
    }),
  ]

  // Waiting on someone else: Police, the Director, or a colleague who holds it.
  const waitingLines: Line[] = items
    .filter((n) => !n.needsMe && n.action !== 'closed' && n.action !== 'follow_court' && (n.holder === 'police' || n.holder === 'director' || (n.holder === 'officer' && n.holderId && !n.heldByMe)))
    .map((n) => {
      const f = titleOf.get(n.fileId)
      return { key: `waiting:${n.fileId}`, fileId: n.fileId, to: 'file', title: f?.title ?? '', detail: `${holderLabel(n)} · ${actionLabel(n)}${f ? ` · ${fileReference(f)}` : ''}` }
    })

  const needs = decideLines.length + workload.incomingWaiting
  const continues = recents.filter((r) => r.kind === 'file' || r.kind === 'document').slice(0, 3)

  return (
    <article className="page flex flex-col gap-6">
      <header className="page-header">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(new Date(), 'weekday')}</p>
          <h1>{greeting}</h1>
          <p className="text-base">{needs === 0 ? m["today.nothing"]() : `${plural(needs, m["count.awaiting_file.one"], m["count.awaiting_file.many"])}.`}</p>
        </div>
        <div className="page-actions">
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

      {continues.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m["today.continue"]()}</h2>
            <span className="text-xs text-muted-foreground">{m["today.continue_note"]()}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {continues.map((r) => (
              <Link key={r.key} to={r.to} className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5 rounded-[14px] border border-border px-4 py-3 text-foreground no-underline hover:bg-secondary/50">
                <span className="truncate text-sm font-semibold">{tabTitle(r)}</span>
                <span className="text-xs text-muted-foreground">{r.kind === 'document' ? m["nav.item.documents"]() : (() => { const n = forFile(r.key.replace('file:', '')); return n ? (n.needsMe ? actionLabel(n) : holderLabel(n)) : m["today.continue_file"]() })()}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-stretch gap-[18px]">
        <Card title={m["today.decide"]()} tone="attention" lines={decideLines} empty={m["today.decide_empty"]()} />
        <Card title={m["today.court"]()} lines={courtLines} empty={m["today.court_empty"]()} />
      </div>
      <div className="flex flex-wrap items-stretch gap-[18px]">
        <Card title={m["today.deadlines"]()} lines={deadlineLines} empty={m["today.deadlines_empty"]()} />
        <Card title={m["today.waiting"]()} lines={waitingLines} empty={m["today.waiting_empty"]()} />
      </div>

    </article>
  )
}
