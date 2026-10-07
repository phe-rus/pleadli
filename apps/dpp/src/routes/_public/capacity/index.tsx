import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { capacityOptions, useCapacity, useWorkload, workloadOptions } from '@/features/workload'
import { BarRow, Panel } from '@/features/workload/insights'
import { ageLabel } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/capacity/')({
  loader: async ({ context }) => {
    const { queryClient } = context
    await Promise.all([queryClient.query({ ...workloadOptions(), staleTime: 'static' }), queryClient.query({ ...capacityOptions(6), staleTime: 'static' })])
  },
  component: RouteComponent,
})

/** A file waiting, with how long, as a row that opens it. */
function WaitingGroup({ title, empty, items, unit }: { title: string; empty: string; items: { fileId: string; title: string; reference: string | null; since: number }[]; unit: (params: { date: string }) => string }) {
  return (
    <Group title={title}>
      {items.length === 0 ? (
        <GroupRow label={<span className="text-muted-foreground">{empty}</span>} />
      ) : (
        items.map((item) => (
          <GroupRow
            key={item.fileId}
            label={item.title}
            detail={[item.reference, unit({ date: formatDate(item.since) })].filter(Boolean).join(' · ')}
            value={<span className="font-medium text-foreground tabular-nums">{ageLabel(item.since)}</span>}
            chevron
            render={({ className, children }) => (
              <Link to="/files/$fileId" params={{ fileId: item.fileId }} search={{ tab: 'case' }} className={className}>
                {children}
              </Link>
            )}
          />
        ))
      )}
    </Group>
  )
}

/**
 * What is on this office's desk now: how many files are where, which have
 * waited longest, and how old the waiting work is. How things went over a
 * period is in Statistics. It measures work, not the prosecutor.
 */
function RouteComponent() {
  const navigate = useNavigate()
  const { data: workload } = useWorkload()
  const { data: cap } = useCapacity(6)

  const bands = [
    { id: 'week', label: m["capacity.age_band.under_week"](), value: workload.ageBands.underAWeek },
    { id: 'two', label: m["capacity.age_band.one_to_two"](), value: workload.ageBands.oneToTwoWeeks },
    { id: 'four', label: m["capacity.age_band.two_to_four"](), value: workload.ageBands.twoToFourWeeks },
    { id: 'over', label: m["capacity.age_band.over_four"](), value: workload.ageBands.overFourWeeks },
  ]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.workload"]()}</h1>
          <p>{m["workload.subtitle"]()}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={m["overview.figure.awaiting_decision"]()} value={workload.awaitingDecision} tone={workload.awaitingDecision ? 'attention' : 'plain'} onClick={() => void navigate({ to: '/files', search: { view: 'review' } })} />
        <Stat label={m["file.view.returned.label"]()} value={workload.returned} onClick={() => void navigate({ to: '/files', search: { view: 'returned' } })} />
        <Stat label={m["capacity.queue.documents_label"]()} value={workload.draftDocuments} onClick={() => void navigate({ to: '/documents' })} />
        <Stat label={m["capacity.queue.concluded_label"]()} value={workload.concluded} onClick={() => void navigate({ to: '/files', search: { view: 'concluded' } })} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WaitingGroup title={m["capacity.longest_waiting"]()} empty={m["review_page.empty_any"]()} items={cap.longestWaiting} unit={m["capacity.waiting_since"]} />
        <WaitingGroup title={m["capacity.longest_with_police"]()} empty={m["capacity.none_with_police"]()} items={cap.longestWithPolice} unit={m["capacity.returned_on"]} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={m["capacity.age"]()} hint={m["capacity.age_hint"]()}>
          {workload.awaitingDecision === 0 ? <EmptyNote>{m["review_page.empty_any"]()}</EmptyNote> : bands.map((band) => <BarRow key={band.id} label={band.label} value={band.value} max={workload.awaitingDecision} />)}
        </Panel>
        <Panel title={m["capacity.by_station"]()} hint={m["capacity.by_station_hint"]()}>
          {workload.stations.length === 0 ? <EmptyNote>{m["capacity.no_active"]()}</EmptyNote> : workload.stations.map((s) => <BarRow key={s.label} label={s.label} value={s.count} max={workload.stations[0].count} />)}
        </Panel>
      </div>
    </article>
  )
}
