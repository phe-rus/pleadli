import { formatDate } from '@/lib/dates'
import { serviceNames } from '@/lib/jurisdiction'
import { EmptyNote, Planned } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { decisionTypeLabel } from '@/features/decisions/schema'
import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { capacityOptions, useCapacity, useWorkload, workloadOptions, type Spread } from '@/features/workload'
import { ageLabel, plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'

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

const monthLabel = (ms: number, short = false) => new Date(ms).toLocaleString(getLocale(), { month: 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' })
const days = (value: number | null) => (value === null ? m["capacity.none_yet"]() : m["capacity.days"]({ days: value < 10 ? value.toFixed(1) : String(Math.round(value)) }))
const bandLabels = () => [m["capacity.turnaround_band.week"](), m["capacity.turnaround_band.two_weeks"](), m["capacity.turnaround_band.four_weeks"](), m["capacity.turnaround_band.longer"]()]

type CountMessage = (params: { count: number }) => string

/** How long something took, over the period: the middle case, the average, the
 * longest, and how the cases spread. */
function TurnaroundCard({ title, about, what, spread }: { title: string; about: string; what: [CountMessage, CountMessage]; spread: Spread }) {
  const max = Math.max(1, ...spread.bands)
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3>{title}</h3>
        <p>{about}</p>
      </div>
      {spread.count === 0 ? (
        <p>{m["capacity.nothing_to_measure"]()}</p>
      ) : (
        <>
          <p>
            <span className="text-2xl font-semibold text-foreground tabular-nums">{days(spread.medianDays)}</span> {m["capacity.spread"]({ across: plural(spread.count, ...what), average: days(spread.meanDays), longest: days(spread.longestDays) })}
          </p>
          <div className="flex flex-col gap-1.5">
            {bandLabels().map((label, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3">
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

function WaitingList({ title, empty, items, tab, unit }: { title: string; empty: string; items: { fileId: string; title: string; reference: string | null; since: number }[]; tab: 'review' | 'decisions'; unit: (params: { date: string }) => string }) {
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
              summary={`${item.reference ? `${item.reference}. ` : ''}${unit({ date: formatDate(item.since) })}`}
              trailing={
                <>
                  <span className="font-semibold text-foreground tabular-nums">{ageLabel(item.since)}</span>
                  <Link to="/files/$fileId" params={{ fileId: item.fileId }} search={{ tab }} className="text-primary">{m["common.open"]()}</Link>
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
    { id: 'week', label: m["capacity.age_band.under_week"](), value: workload.ageBands.underAWeek },
    { id: 'two', label: m["capacity.age_band.one_to_two"](), value: workload.ageBands.oneToTwoWeeks },
    { id: 'four', label: m["capacity.age_band.two_to_four"](), value: workload.ageBands.twoToFourWeeks },
    { id: 'over', label: m["capacity.age_band.over_four"](), value: workload.ageBands.overFourWeeks },
  ]
  const queues = [
    { id: 'intake', label: m["nav.item.intake"](), detail: m["capacity.queue.intake"](), value: workload.intake, view: 'intake' as const },
    { id: 'review', label: m["capacity.queue.in_review_label"](), detail: m["capacity.queue.in_review"](), value: workload.inReview, view: 'active' as const },
    { id: 'returned', label: m["nav.item.returned"](), detail: m["capacity.queue.returned"](), value: workload.returned, view: 'returned' as const },
    { id: 'reopened', label: m["nav.item.reopened"](), detail: m["capacity.queue.reopened"](), value: workload.reopened, view: 'reopened' as const },
    { id: 'documents', label: m["capacity.queue.documents_label"](), detail: m["capacity.queue.documents"](), value: workload.draftDocuments, view: null },
    { id: 'concluded', label: m["capacity.queue.concluded_label"](), detail: m["capacity.queue.concluded"](), value: workload.concluded, view: 'closed' as const },
  ]
  const flowMax = Math.max(1, ...cap.months.flatMap((mo) => [mo.received, mo.filesDecided]))
  const backlogMax = Math.max(1, ...cap.months.map((mo) => mo.awaitingAtEnd + mo.withPoliceAtEnd))
  const stations = workload.stations
  const answered = cap.directionsMet + cap.directionsNotMet
  const mixMax = Math.max(1, ...cap.decisionMix.map((d) => d.count))
  const offenceMax = Math.max(1, ...cap.byOffence.map((d) => d.count))

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.capacity"]()}</h1>
          <p>{m["capacity.subtitle"]()}</p>
        </div>
        <nav aria-label={m["capacity.period"]()} className="page-actions">
          {periods.map((p) => (
            <Link
              key={p}
              to="/capacity"
              search={{ months: p }}
              replace
              aria-current={p === chosen ? 'page' : undefined}
              className={cn('rounded-md px-2.5 py-1 no-underline', p === chosen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {m["capacity.months"]({ count: p })}
            </Link>
          ))}
        </nav>
      </header>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["capacity.queues"]()}</h2>
          <Tag tone="neutral">{plural(active, m["count.active_file.one"], m["count.active_file.many"])}</Tag>
        </div>
        <RowList>
          {queues.map((queue) => (
            <Row
              key={queue.id}
              title={queue.label}
              summary={queue.detail}
              trailing={
                <>
                  <span className="text-2xl font-semibold tabular-nums">{queue.value}</span>
                  {queue.view ? <Link to="/files" search={{ view: queue.view }} className="text-primary">{m["common.open"]()}</Link> : <Link to="/documents" className="text-primary">{m["common.open"]()}</Link>}
                </>
              }
            />
          ))}
        </RowList>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <WaitingList title={m["capacity.longest_waiting"]()} empty={m["review_page.empty_any"]()} items={cap.longestWaiting} tab="review" unit={m["capacity.waiting_since"]} />
        <WaitingList title={m["capacity.longest_with_police"]()} empty={m["capacity.none_with_police"]()} items={cap.longestWithPolice} tab="decisions" unit={m["capacity.returned_on"]} />
      </div>

      <section className="page-section">
        <h2>{m["capacity.moved"]()}</h2>
        <p>{m["capacity.moved_hint"]()}</p>
        <div className="no-scrollbar overflow-x-auto">
          <div className="grid min-w-[36rem] gap-y-2" style={{ gridTemplateColumns: `11rem repeat(${cap.months.length}, minmax(3.5rem, 1fr))` }}>
            <span />
            {cap.months.map((mo) => (
              <span key={mo.startsAt} className="text-center text-xs text-muted-foreground">
                {monthLabel(mo.startsAt, chosen > 6)}
                {mo.partial ? ' *' : ''}
              </span>
            ))}
            {[
              { id: 'received', label: m["capacity.row.received"](), get: (mo: (typeof cap.months)[number]) => mo.received, bar: true },
              { id: 'decided', label: m["capacity.row.decided"](), get: (mo: (typeof cap.months)[number]) => mo.filesDecided, bar: true, muted: true },
              { id: 'returned', label: m["nav.item.returned"](), get: (mo: (typeof cap.months)[number]) => mo.returned },
              { id: 'resubmitted', label: m["overview.figure.resubmitted"](), get: (mo: (typeof cap.months)[number]) => mo.resubmitted },
              { id: 'issued', label: m["capacity.row.issued"](), get: (mo: (typeof cap.months)[number]) => mo.documentsIssued },
            ].map((row) => (
              <div key={row.id} className="contents">
                <span>{row.label}</span>
                {cap.months.map((mo) => (
                  <span key={mo.startsAt} className="flex flex-col items-center gap-1 px-1">
                    <span className="tabular-nums">{row.get(mo)}</span>
                    {row.bar && <Bar value={row.get(mo)} max={flowMax} className={row.muted ? 'bg-muted-foreground/40' : undefined} />}
                  </span>
                ))}
              </div>
            ))}
            <span className="border-t pt-2 font-semibold text-foreground">{m["capacity.row.waiting_end"]()}</span>
            {cap.months.map((mo) => (
              <span key={mo.startsAt} className="flex flex-col items-center gap-1 border-t px-1 pt-2">
                <span className="tabular-nums">{mo.awaitingAtEnd}</span>
                <Bar value={mo.awaitingAtEnd} max={backlogMax} />
              </span>
            ))}
            <span className="font-semibold text-foreground">{m["capacity.row.police_end"]()}</span>
            {cap.months.map((mo) => (
              <span key={mo.startsAt} className="flex flex-col items-center gap-1 px-1">
                <span className="tabular-nums">{mo.withPoliceAtEnd}</span>
                <Bar value={mo.withPoliceAtEnd} max={backlogMax} className="bg-sky-500" />
              </span>
            ))}
          </div>
        </div>
        <p>{m["capacity.replay_hint"]()}</p>
      </section>

      <section className="page-section">
        <h2>{m["capacity.how_long"]()}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TurnaroundCard title={m["capacity.turnaround.referral"]()} about={m["capacity.turnaround.referral_about"]()} what={[m["count.file.one"], m["count.file.many"]]} spread={cap.turnaround.referralToDecision} />
          <TurnaroundCard title={m["capacity.turnaround.police"]()} about={m["capacity.turnaround.police_about"]()} what={[m["count.return.one"], m["count.return.many"]]} spread={cap.turnaround.timeWithPolice} />
          <TurnaroundCard title={m["capacity.turnaround.document"]()} about={m["capacity.turnaround.document_about"]()} what={[m["count.document.one"], m["count.document.many"]]} spread={cap.turnaround.documentToIssue} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="page-section">
          <h2>{m["capacity.age"]()}</h2>
          <p>{m["capacity.age_hint"]()}</p>
          {workload.awaitingDecision === 0 ? (
            <EmptyNote>{m["review_page.empty_any"]()}</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {bands.map((band) => (
                <div key={band.id} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3">
                  <span>{band.label}</span>
                  <Bar value={band.value} max={workload.awaitingDecision} />
                  <span className="text-right tabular-nums">{band.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="page-section">
          <h2>{m["capacity.decisions"]()}</h2>
          <p>{m["capacity.decisions_hint"]()}</p>
          {cap.decisionMix.length === 0 ? (
            <EmptyNote>{m["capacity.decisions_empty"]()}</EmptyNote>
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
          <h2>{m["capacity.by_station"]()}</h2>
          <p>{m["capacity.by_station_hint"]()}</p>
          {stations.length === 0 ? (
            <EmptyNote>{m["capacity.no_active"]()}</EmptyNote>
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
          <h2>{m["capacity.by_offence"]()}</h2>
          <p>{m["capacity.by_offence_hint"]()}</p>
          {cap.byOffence.length === 0 ? (
            <EmptyNote>{m["capacity.by_offence_empty"]()}</EmptyNote>
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
        <h2>{m["capacity.directions"]()}</h2>
        {cap.directionsMet + cap.directionsNotMet + cap.directionsOpen === 0 ? (
          <EmptyNote>{m["capacity.directions_empty"]()}</EmptyNote>
        ) : (
          <p>
            {m["capacity.directions_summary"]({ directions: plural(cap.directionsMet + cap.directionsNotMet + cap.directionsOpen, m["count.direction.one"], m["count.direction.many"]), met: cap.directionsMet, not_met: cap.directionsNotMet, open: cap.directionsOpen })}
            {answered > 0 ? ` ${m["capacity.directions_rate"]({ percent: Math.round((cap.directionsMet / answered) * 100) })}` : ''}
          </p>
        )}
      </section>

      <section className="page-section">
        <h2>{m["capacity.by_prosecutor"]()}</h2>
        <p>{m["capacity.by_prosecutor_hint"]()}</p>
        <RowList>
          <Row
            aligned
            title={profile?.name ?? m["workspace.profile.none_title"]()}
            summary={profile ? (profile.isDpp ? m["workspace.profile.dpp"]({ head: serviceNames().head }) : (profile.rank ?? undefined)) : m["capacity.set_prosecutor"]()}
            trailing={<span className="text-2xl font-semibold tabular-nums">{active}</span>}
          />
        </RowList>
      </section>

      <Planned title={m["capacity.not_measured"]()} covers={[m["capacity.not_measured_target"](), m["capacity.not_measured_court"]()]}>
        {m["capacity.not_measured_body"]()}
      </Planned>
    </article>
  )
}
