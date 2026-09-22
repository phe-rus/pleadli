import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { engagementLabel } from '@/features/matters'
import { durationText, timeOptions, useTime } from '@/features/practice'
import { DAY_MS, startOfDay } from '@/lib/day'
import { AlarmClockIcon, FolderViewIcon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

const periods = [
  { id: '30', days: 30, label: 'Last 30 days' },
  { id: '90', days: 90, label: 'Last 90 days' },
  { id: '365', days: 365, label: 'Last year' },
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
  const { period = '30' } = Route.useSearch()
  const current = periods.find((p) => p.id === period) ?? periods[0]
  const { from, to } = range(current.days)
  const { data: entries } = useTime(from, to)
  const total = entries.reduce((sum, e) => sum + e.minutes, 0)
  const byMatter = new Map<string, { title: string; engagement: string | null; minutes: number }>()
  for (const e of entries) {
    const key = e.matterId
    const slot = byMatter.get(key) ?? { title: e.courtNumber ?? e.matterTitle ?? 'Matter', engagement: e.engagement, minutes: 0 }
    slot.minutes += e.minutes
    byMatter.set(key, slot)
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Time</h1>
          <p>Time you recorded on matters. Record it from a matter.</p>
        </div>
      </header>

      <nav aria-label="Period" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {periods.map((item) => (
          <Link
            key={item.id}
            to="/time"
            search={{ period: item.id }}
            replace
            aria-current={item.id === period ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-1.5 no-underline',
              item.id === period ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label="Time recorded" icon={AlarmClockIcon} tint="primary" value={durationText(total)} caption={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in this period`} />
        <StatTile label="Matters" icon={FolderViewIcon} tint="emerald" value={byMatter.size} caption="With time recorded in this period" />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="by-matter" className="page-section">
          <h2 id="by-matter">By matter</h2>
          {byMatter.size === 0 ? (
            <EmptyNote>No time was recorded in this period.</EmptyNote>
          ) : (
            <RowList>
              {[...byMatter.entries()]
                .sort((a, b) => b[1].minutes - a[1].minutes)
                .map(([matterId, slot]) => (
                  <Row
                    key={matterId}
                    aligned
                    title={
                      <Link to="/matters/$matterId" params={{ matterId }} className="text-foreground">
                        {slot.title}
                      </Link>
                    }
                    summary={slot.engagement ? engagementLabel(slot.engagement) : undefined}
                    trailing={<Tag tone="neutral">{durationText(slot.minutes)}</Tag>}
                  />
                ))}
            </RowList>
          )}
        </section>

        <section aria-labelledby="entries" className="page-section">
          <h2 id="entries">Entries</h2>
          {entries.length === 0 ? (
            <EmptyNote>Nothing to show.</EmptyNote>
          ) : (
            <RowList>
              {entries.map((e) => (
                <Row key={e.id} aligned title={e.description} summary={`${format(e.workedOn, 'd MMM yyyy')}. ${e.courtNumber ?? e.matterTitle ?? ''}`} trailing={<Tag tone="neutral">{durationText(e.minutes)}</Tag>} />
              ))}
            </RowList>
          )}
        </section>
      </div>
    </article>
  )
}
