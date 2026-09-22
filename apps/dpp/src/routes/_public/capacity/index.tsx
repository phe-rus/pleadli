import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { decisionTypeLabel } from '@/features/decisions/schema'
import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { capacityOptions, useCapacity, useWorkload, workloadOptions, type Spread } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

const periods = [3, 6, 12] as const
type Period = (typeof periods)[number]

export const Route = createFileRoute('/_public/capacity/')({
  validateSearch: (search: Record<string, unknown>): { months?: Period } => (periods.includes(Number(search.months) as Period) ? { months: Number(search.months) as Period } : {}),
  loaderDeps: ({ search }) => ({ months: search.months ?? 6 }),
  loader: async ({ context, deps }) => {
    const { queryClient } = context
    await Promise.all([queryClient.query({ ...workloadOptions(), staleTime: 'static' }), queryClient.query({ ...capacityOptions(deps.months), staleTime: 'static' })])
  },
  component: RouteComponent,
})

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <span aria-hidden className="block h-2 w-full rounded-full bg-secondary">
      <span className={cn('block h-2 rounded-full bg-primary', className)} style={{ width: `${max === 0 ? 0 : Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }} />
    </span>
  )
}

const monthLabel = (ms: number, short = false) => new Date(ms).toLocaleString('en-GB', { month: 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' })
const days = (value: number | null) => (value === null ? 'none yet' : `${value < 10 ? value.toFixed(1) : Math.round(value)} days`)
const bandLabels = ['Up to a week', 'Up to two weeks', 'Up to four weeks', 'Longer']

/** How long something took, over the period: the middle case, the average, the
 * longest, and how the cases spread. */
function TurnaroundCard({ title, about, what, spread }: { title: string; about: string; what: string; spread: Spread }) {
  const max = Math.max(1, ...spread.bands)
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3>{title}</h3>
        <p>{about}</p>
      </div>
      {spread.count === 0 ? (
        <p>Nothing to measure in this period yet.</p>
      ) : (
        <>
          <p>
            <span className="text-2xl font-semibold text-foreground tabular-nums">{days(spread.medianDays)}</span> in the middle, across {plural(spread.count, what)}. Average {days(spread.meanDays)}, longest {days(spread.longestDays)}.
          </p>
          <div className="flex flex-col gap-1.5">
            {bandLabels.map((label, i) => (
              <div key={label} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3">
                <span>{label}</span>
                <Bar value={spread.bands[i]} max={max} />
                <span className="text-right tabular-nums">{spread.bands[i]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function WaitingList({ title, empty, items, tab, unit }: { title: string; empty: string; items: { fileId: string; title: string; reference: string | null; since: number }[]; tab: 'review' | 'decisions'; unit: string }) {
  return (
    <section className="page-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <EmptyNote>{empty}</EmptyNote>
      ) : (
        <RowList>
          {items.map((item) => (
            <Row
              key={item.fileId}
              title={item.title}
              summary={`${item.reference ? `${item.reference}. ` : ''}${unit} ${format(item.since, 'PP')}.`}
              trailing={
                <>
                  <span className="font-semibold text-foreground tabular-nums">{ageLabel(item.since)}</span>
                  <Link to="/files/$fileId" params={{ fileId: item.fileId }} search={{ tab }} className="text-primary">Open</Link>
                </>
              }
            />
          ))}
        </RowList>
      )}
    </section>
  )
}

/** How much work sits with this installation, how it has moved, how long it
 * takes, and where it is concentrated. Counted from the record when the page
 * opens. It measures work, not the prosecutor: there is no target here and none
 * is implied. */
function RouteComponent() {
  const { months: chosen = 6 } = Route.useSearch()
  const { data: workload } = useWorkload()
  const { data: cap } = useCapacity(chosen)
  const { data: profile } = useProsecutorProfile()

  const active = workload.awaitingDecision + workload.returned
  const bands = [
    { label: 'Under a week', value: workload.ageBands.underAWeek },
    { label: 'One to two weeks', value: workload.ageBands.oneToTwoWeeks },
    { label: 'Two to four weeks', value: workload.ageBands.twoToFourWeeks },
    { label: 'Over four weeks', value: workload.ageBands.overFourWeeks },
  ]
  const queues = [
    { label: 'Intake', detail: 'Received, no review recorded', value: workload.intake, view: 'intake' as const },
    { label: 'In review', detail: 'Awaiting a decision, review under way or resubmitted', value: workload.inReview, view: 'active' as const },
    { label: 'Returned to Police', detail: 'With Police for further investigation', value: workload.returned, view: 'returned' as const },
    { label: 'Reopened reviews', detail: 'Concluded decisions brought back for review', value: workload.reopened, view: 'reopened' as const },
    { label: 'Documents pending', detail: 'Prepared and not yet issued', value: workload.draftDocuments, view: null },
    { label: 'Concluded', detail: 'The charging decision has been made', value: workload.concluded, view: 'closed' as const },
  ]
  const flowMax = Math.max(1, ...cap.months.flatMap((m) => [m.received, m.filesDecided]))
  const backlogMax = Math.max(1, ...cap.months.map((m) => m.awaitingAtEnd + m.withPoliceAtEnd))
  const stations = workload.stations
  const answered = cap.directionsMet + cap.directionsNotMet
  const mixMax = Math.max(1, ...cap.decisionMix.map((d) => d.count))
  const offenceMax = Math.max(1, ...cap.byOffence.map((d) => d.count))

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Capacity and workload</h1>
          <p>How much work is sitting with this installation, how it has moved, and where it is concentrated. It measures the work, not the prosecutor.</p>
        </div>
        <nav aria-label="Period" className="page-actions">
          {periods.map((p) => (
            <Link
              key={p}
              to="/capacity"
              search={{ months: p }}
              replace
              aria-current={p === chosen ? 'page' : undefined}
              className={cn('rounded-md px-2.5 py-1 no-underline', p === chosen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {p} months
            </Link>
          ))}
        </nav>
      </header>

      <section className="page-section">
        <div className="section-head">
          <h2>Queues</h2>
          <Tag tone="neutral">{plural(active, 'active file')}</Tag>
        </div>
        <RowList>
          {queues.map((queue) => (
            <Row
              key={queue.label}
              title={queue.label}
              summary={queue.detail}
              trailing={
                <>
                  <span className="text-2xl font-semibold tabular-nums">{queue.value}</span>
                  {queue.view ? <Link to="/files" search={{ view: queue.view }} className="text-primary">Open</Link> : <Link to="/documents" className="text-primary">Open</Link>}
                </>
              }
            />
          ))}
        </RowList>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <WaitingList title="Longest waiting on a decision" empty="No file is waiting on a decision." items={cap.longestWaiting} tab="review" unit="Waiting since" />
        <WaitingList title="Longest with Police" empty="No file is with Police." items={cap.longestWithPolice} tab="decisions" unit="Returned" />
      </div>

      <section className="page-section">
        <h2>How the work has moved</h2>
        <p>By calendar month. A decision about several counts counts once. The last column is this month so far.</p>
        <div className="no-scrollbar overflow-x-auto">
          <div className="grid min-w-[36rem] gap-y-2" style={{ gridTemplateColumns: `11rem repeat(${cap.months.length}, minmax(3.5rem, 1fr))` }}>
            <span />
            {cap.months.map((m) => (
              <span key={m.startsAt} className="text-center text-xs text-muted-foreground">
                {monthLabel(m.startsAt, chosen > 6)}
                {m.partial ? ' *' : ''}
              </span>
            ))}
            {[
              { label: 'Files received', get: (m: (typeof cap.months)[number]) => m.received, bar: true },
              { label: 'Files decided', get: (m: (typeof cap.months)[number]) => m.filesDecided, bar: true, muted: true },
              { label: 'Returned to Police', get: (m: (typeof cap.months)[number]) => m.returned },
              { label: 'Resubmitted', get: (m: (typeof cap.months)[number]) => m.resubmitted },
              { label: 'Documents issued', get: (m: (typeof cap.months)[number]) => m.documentsIssued },
            ].map((row) => (
              <div key={row.label} className="contents">
                <span>{row.label}</span>
                {cap.months.map((m) => (
                  <span key={m.startsAt} className="flex flex-col items-center gap-1 px-1">
                    <span className="tabular-nums">{row.get(m)}</span>
                    {row.bar && <Bar value={row.get(m)} max={flowMax} className={row.muted ? 'bg-muted-foreground/40' : undefined} />}
                  </span>
                ))}
              </div>
            ))}
            <span className="border-t pt-2 font-semibold text-foreground">Waiting on a decision, at month end</span>
            {cap.months.map((m) => (
              <span key={m.startsAt} className="flex flex-col items-center gap-1 border-t px-1 pt-2">
                <span className="tabular-nums">{m.awaitingAtEnd}</span>
                <Bar value={m.awaitingAtEnd} max={backlogMax} />
              </span>
            ))}
            <span className="font-semibold text-foreground">With Police, at month end</span>
            {cap.months.map((m) => (
              <span key={m.startsAt} className="flex flex-col items-center gap-1 px-1">
                <span className="tabular-nums">{m.withPoliceAtEnd}</span>
                <Bar value={m.withPoliceAtEnd} max={backlogMax} className="bg-sky-500" />
              </span>
            ))}
          </div>
        </div>
        <p>Waiting at month end is replayed from each file's referrals, decisions and resubmissions, at the level of the whole file.</p>
      </section>

      <section className="page-section">
        <h2>How long it takes</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TurnaroundCard title="Referral to first decision" about="From the referral to the first charging decision, for files decided in this period." what="file" spread={cap.turnaround.referralToDecision} />
          <TurnaroundCard title="Time with Police" about="From a return to the resubmission that answered it." what="return" spread={cap.turnaround.timeWithPolice} />
          <TurnaroundCard title="Document to issue" about="From a document being prepared to it being issued." what="document" spread={cap.turnaround.documentToIssue} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="page-section">
          <h2>Age of pending work</h2>
          <p>How long files awaiting a decision have been waiting, from the referral or the latest resubmission.</p>
          {workload.awaitingDecision === 0 ? (
            <EmptyNote>No file is waiting on a decision.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {bands.map((band) => (
                <div key={band.label} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3">
                  <span>{band.label}</span>
                  <Bar value={band.value} max={workload.awaitingDecision} />
                  <span className="text-right tabular-nums">{band.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="page-section">
          <h2>Decisions in this period</h2>
          <p>By kind. Several counts decided together count once.</p>
          {cap.decisionMix.length === 0 ? (
            <EmptyNote>No decisions in this period.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {cap.decisionMix.map((d) => (
                <div key={d.label} className="grid grid-cols-[minmax(0,12rem)_1fr_2rem] items-center gap-3">
                  <span className="truncate" title={decisionTypeLabel(d.label)}>{decisionTypeLabel(d.label)}</span>
                  <Bar value={d.count} max={mixMax} className="bg-muted-foreground/40" />
                  <span className="text-right tabular-nums">{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="page-section">
          <h2>Where it is concentrated: station</h2>
          <p>Active files (awaiting a decision or with Police) by the Police station that referred them.</p>
          {stations.length === 0 ? (
            <EmptyNote>No active files.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {stations.map((s) => (
                <div key={s.label} className="grid grid-cols-[minmax(0,12rem)_1fr_2rem] items-center gap-3">
                  <span className="truncate" title={s.label}>{s.label}</span>
                  <Bar value={s.count} max={stations[0].count} />
                  <span className="text-right tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="page-section">
          <h2>Where it is concentrated: offence</h2>
          <p>Proposed charges on active files, by offence.</p>
          {cap.byOffence.length === 0 ? (
            <EmptyNote>No proposed charges on active files.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {cap.byOffence.map((o) => (
                <div key={o.label} className="grid grid-cols-[minmax(0,12rem)_1fr_2rem] items-center gap-3">
                  <span className="truncate" title={o.label}>{o.label}</span>
                  <Bar value={o.count} max={offenceMax} />
                  <span className="text-right tabular-nums">{o.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="page-section">
        <h2>Directions to Police</h2>
        {cap.directionsMet + cap.directionsNotMet + cap.directionsOpen === 0 ? (
          <EmptyNote>No directions have been given.</EmptyNote>
        ) : (
          <p>
            Of {plural(cap.directionsMet + cap.directionsNotMet + cap.directionsOpen, 'direction')} given, {cap.directionsMet} met, {cap.directionsNotMet} not met and {cap.directionsOpen} still open
            {answered > 0 ? ` (${Math.round((cap.directionsMet / answered) * 100)}% of those answered were met)` : ''}.
          </p>
        )}
      </section>

      <section className="page-section">
        <h2>By prosecutor</h2>
        <p>This installation has one prosecutor, so all of the work sits with them.</p>
        <RowList>
          <Row
            aligned
            title={profile?.name ?? 'No prosecutor set'}
            summary={profile ? (profile.isDpp ? 'Director of Public Prosecutions' : (profile.rank ?? undefined)) : 'Set the prosecutor in Settings so decisions and documents carry a name.'}
            trailing={<span className="text-2xl font-semibold tabular-nums">{active}</span>}
          />
        </RowList>
      </section>

      <Planned title="Not measured" covers={['Comparison between prosecutors or against a target: none is defined, and none is implied.', 'Court-side timings, until court matters are recorded.']}>
        Capacity is for seeing how much work there is and where, so it can be planned for.
      </Planned>
    </article>
  )
}
