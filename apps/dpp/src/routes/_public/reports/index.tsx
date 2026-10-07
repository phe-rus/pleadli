import { serviceNames } from '@/lib/jurisdiction'
import { EmptyNote } from '@/components/planned'
import { decisionTypeLabel } from '@/features/decisions/schema'
import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { capacityOptions, useCapacity, useWorkload, workloadOptions } from '@/features/workload'
import { Bar, BarRow, monthLabel, Panel, TurnaroundCard } from '@/features/workload/insights'
import { plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

const periods = ['3', '6', '12'] as const
type Period = (typeof periods)[number]

export const Route = createFileRoute('/_public/reports/')({
  validateSearch: (search: Record<string, unknown>): { months?: Period } => (periods.includes(String(search.months) as Period) ? { months: String(search.months) as Period } : {}),
  loaderDeps: ({ search }) => ({ months: Number(search.months ?? 6) }),
  loader: async ({ context, deps }) => {
    const { queryClient } = context
    await Promise.all([queryClient.query({ ...workloadOptions(), staleTime: 'static' }), queryClient.query({ ...capacityOptions(deps.months), staleTime: 'static' })])
  },
  component: RouteComponent,
})

/**
 * How the office's work went over a period: what came in and what was decided
 * month by month, how long things take, what was decided, and what it was
 * about. Counted from the record when the page opens; there is no target here
 * and none is implied.
 */
function RouteComponent() {
  const navigate = useNavigate()
  const { months = '6' } = Route.useSearch()
  const chosen = Number(months)
  const { data: workload } = useWorkload()
  const { data: cap } = useCapacity(chosen)
  const { data: profile } = useProsecutorProfile()

  const received = cap.months.reduce((t, mo) => t + mo.received, 0)
  const decided = cap.months.reduce((t, mo) => t + mo.filesDecided, 0)
  const issued = cap.months.reduce((t, mo) => t + mo.documentsIssued, 0)
  const flowMax = Math.max(1, ...cap.months.flatMap((mo) => [mo.received, mo.filesDecided]))
  const mixMax = Math.max(1, ...cap.decisionMix.map((d) => d.count))
  const offenceMax = Math.max(1, ...cap.byOffence.map((d) => d.count))
  const answered = cap.directionsMet + cap.directionsNotMet
  const directions = cap.directionsMet + cap.directionsNotMet + cap.directionsOpen

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.statistics"]()}</h1>
          <p>{m["statistics.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["capacity.period"]()}
            value={months}
            onChange={(p) => void navigate({ to: '/reports', search: { months: p }, replace: true })}
            items={periods.map((p) => ({ value: p, label: m["capacity.months"]({ count: Number(p) }) }))}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={m["capacity.row.received"]()} value={received} />
        <Stat label={m["capacity.row.decided"]()} value={decided} />
        <Stat label={m["capacity.row.issued"]()} value={issued} />
        <Stat label={m["capacity.turnaround.referral"]()} value={cap.turnaround.referralToDecision.medianDays === null ? '·' : `${Math.round(cap.turnaround.referralToDecision.medianDays)} d`} hint={m["statistics.median"]()} />
      </div>

      {/* Month by month: what came in against what was decided. */}
      <Panel title={m["capacity.moved"]()} hint={m["capacity.replay_hint"]()}>
        <div className="no-scrollbar overflow-x-auto">
          <div className="flex min-w-[32rem] items-end gap-2" style={{ height: '10rem' }}>
            {cap.months.map((mo) => (
              <div key={mo.startsAt} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <span title={`${m["capacity.row.received"]()}: ${mo.received}`} className="w-3 rounded-t bg-primary" style={{ height: `${(mo.received / flowMax) * 100}%`, minHeight: mo.received ? 3 : 0 }} />
                  <span title={`${m["capacity.row.decided"]()}: ${mo.filesDecided}`} className="w-3 rounded-t bg-foreground/25" style={{ height: `${(mo.filesDecided / flowMax) * 100}%`, minHeight: mo.filesDecided ? 3 : 0 }} />
                </div>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {monthLabel(mo.startsAt, chosen > 6)}
                  {mo.partial ? ' *' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            {m["capacity.row.received"]()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground/25" />
            {m["capacity.row.decided"]()}
          </span>
        </div>
      </Panel>

      <section className="flex flex-col gap-1.5">
        <h2 data-slot="group-title" className="px-1">
          {m["capacity.how_long"]()}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TurnaroundCard title={m["capacity.turnaround.referral"]()} about={m["capacity.turnaround.referral_about"]()} what={[m["count.file.one"], m["count.file.many"]]} spread={cap.turnaround.referralToDecision} />
          <TurnaroundCard title={m["capacity.turnaround.police"]()} about={m["capacity.turnaround.police_about"]()} what={[m["count.return.one"], m["count.return.many"]]} spread={cap.turnaround.timeWithPolice} />
          <TurnaroundCard title={m["capacity.turnaround.document"]()} about={m["capacity.turnaround.document_about"]()} what={[m["count.document.one"], m["count.document.many"]]} spread={cap.turnaround.documentToIssue} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={m["capacity.decisions"]()} hint={m["capacity.decisions_hint"]()}>
          {cap.decisionMix.length === 0 ? <EmptyNote>{m["capacity.decisions_empty"]()}</EmptyNote> : cap.decisionMix.map((d) => <BarRow key={d.label} label={decisionTypeLabel(d.label)} value={d.count} max={mixMax} className="bg-foreground/30" />)}
        </Panel>
        <Panel title={m["capacity.by_offence"]()} hint={m["capacity.by_offence_hint"]()}>
          {cap.byOffence.length === 0 ? <EmptyNote>{m["capacity.by_offence_empty"]()}</EmptyNote> : cap.byOffence.map((o) => <BarRow key={o.label} label={o.label} value={o.count} max={offenceMax} />)}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={m["capacity.directions"]()}>
          {directions === 0 ? (
            <EmptyNote>{m["capacity.directions_empty"]()}</EmptyNote>
          ) : (
            <>
              <p>
                {m["capacity.directions_summary"]({ directions: plural(directions, m["count.direction.one"], m["count.direction.many"]), met: cap.directionsMet, not_met: cap.directionsNotMet, open: cap.directionsOpen })}
              </p>
              {answered > 0 && <Bar value={cap.directionsMet} max={answered} />}
              {answered > 0 && <p className="text-muted-foreground">{m["capacity.directions_rate"]({ percent: Math.round((cap.directionsMet / answered) * 100) })}</p>}
            </>
          )}
        </Panel>
        <Group title={m["capacity.by_prosecutor"]()} footer={m["capacity.not_measured_body"]()}>
          <GroupRow
            label={profile?.name ?? m["workspace.profile.none_title"]()}
            detail={profile ? (profile.isDpp ? m["workspace.profile.dpp"]({ head: serviceNames().head }) : (profile.rank ?? undefined)) : m["capacity.set_prosecutor"]()}
            value={<span className="text-lg font-semibold text-foreground tabular-nums">{workload.awaitingDecision + workload.returned}</span>}
          />
        </Group>
      </div>
    </article>
  )
}
