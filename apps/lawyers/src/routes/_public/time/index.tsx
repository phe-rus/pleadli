import { EmptyNote } from '@/components/planned'
import { engagementLabel } from '@/features/matters'
import { durationText, timeOptions, useTime } from '@/features/practice'
import { formatDay } from '@/lib/dates'
import { DAY_MS, startOfDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

const periods = [
  { id: '30', days: 30, label: () => m["time.period.30"]() },
  { id: '90', days: 90, label: () => m["time.period.90"]() },
  { id: '365', days: 365, label: () => m["time.period.365"]() },
] as const
type PeriodId = (typeof periods)[number]['id']
const isPeriod = (value: unknown): value is PeriodId => periods.some((p) => p.id === value)

const range = (days: number) => {
  const to = startOfDay(Date.now()) + DAY_MS
  return { from: to - days * DAY_MS, to }
}

export const Route = createFileRoute('/_public/time/')({
  validateSearch: (search: Record<string, unknown>): { period?: PeriodId } => (isPeriod(search.period) ? { period: search.period } : {}),
  loaderDeps: ({ search }) => ({ period: search.period ?? '30' }),
  loader: async ({ context, deps }) => {
    const { from, to } = range(periods.find((p) => p.id === deps.period)?.days ?? 30)
    await context.queryClient.query({ ...timeOptions(from, to), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Time you recorded, by matter. It only adds up what was recorded: whether any
 * of it is billed depends on how you came to act (private time is; state-funded
 * work is paid by the Rules' schedule; pro bono is not), and nothing is priced. */
function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { period = '30' } = Route.useSearch()
  const current = periods.find((p) => p.id === period) ?? periods[0]
  const { from, to } = range(current.days)
  const { data: entries } = useTime(from, to)
  const total = entries.reduce((sum, e) => sum + e.minutes, 0)
  const byMatter = new Map<string, { title: string; engagement: string | null; minutes: number }>()
  for (const e of entries) {
    const slot = byMatter.get(e.matterId) ?? { title: e.courtNumber ?? e.matterTitle ?? m["time.a_matter"](), engagement: e.engagement, minutes: 0 }
    slot.minutes += e.minutes
    byMatter.set(e.matterId, slot)
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.time"]()}</h1>
          <p>{m["time.lead"]()}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["time.period_label"]()}
            value={period}
            onChange={(p) => void navigate({ search: { period: p }, replace: true })}
            items={periods.map((p) => ({ value: p.id, label: p.label() }))}
          />
        </div>
      </header>

      {entries.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Clock01Icon} />}>{m["time.none"]()}</EmptyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={m["time.recorded"]()} value={durationText(total)} hint={m["time.entries_count"]({ count: String(entries.length) })} />
            <Stat label={m["time.matters"]()} value={byMatter.size} />
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <Group title={m["time.by_matter"]()}>
              {[...byMatter.entries()]
                .sort((a, b) => b[1].minutes - a[1].minutes)
                .map(([matterId, slot]) => (
                  <GroupRow
                    key={matterId}
                    label={slot.title}
                    detail={slot.engagement ? engagementLabel(slot.engagement) : undefined}
                    value={<span className="tabular-nums">{durationText(slot.minutes)}</span>}
                    chevron
                    render={({ className, children }) => (
                      <Link to="/matters/$matterId" params={{ matterId }} className={className}>
                        {children}
                      </Link>
                    )}
                  />
                ))}
            </Group>

            <Group title={m["time.entries"]()}>
              {entries.map((e) => (
                <GroupRow
                  key={e.id}
                  label={e.description}
                  detail={`${formatDay(e.workedOn)} · ${e.courtNumber ?? e.matterTitle ?? ''}`}
                  value={<span className="tabular-nums">{durationText(e.minutes)}</span>}
                />
              ))}
            </Group>
          </div>
        </>
      )}
    </article>
  )
}
