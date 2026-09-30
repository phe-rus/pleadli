import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { CertificateTag, complianceOptions, hours } from '@/features/compliance'
import { hearingStatusLabels, reasonLabel } from '@/features/hearings'
import { useLocale } from '@/features/i18n'
import { matterTypeLabel, stageLabel } from '@/features/matter-types'
import { engagementLabel } from '@/features/matters'
import { ugx } from '@/features/money/data'
import { kindLabel, registerLabel } from '@/features/registers'
import { BarList, MonthColumns, statisticsOptions } from '@/features/statistics'
import * as m from '@/paraglide/messages'
import { AlarmClockIcon, Clock01Icon, Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@pleadli/ui/badge'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

type Search = { year?: number }

export const Route = createFileRoute('/_public/statistics/')({
  validateSearch: (search: Record<string, unknown>): Search => {
    const year = Number(search.year)
    return Number.isInteger(year) && year > 1990 ? { year } : {}
  },
  component: RouteComponent,
})

/** The practice in figures for a year, counted from its own records. The
 * deadline clocks and the money held for clients are today's; the rest is
 * the chosen year's. */
function RouteComponent() {
  const { year } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const locale = useLocale()
  const { data: stats } = useQuery(statisticsOptions(year))
  const { data: compliance } = useQuery(complianceOptions(year))
  if (!stats) return null
  const yearItems = stats.years.map((y) => ({ value: String(y), label: String(y) }))

  const byType = stats.byType.map((t) => ({ key: t.matterType, label: matterTypeLabel(t.matterType), value: t.open }))
  const stageRows = stats.openByStage.map((s) => ({ key: `${s.matterType}:${s.stage}`, label: `${matterTypeLabel(s.matterType)} · ${stageLabel(s.stage)}`, value: s.count }))
  const engagementRows = stats.openedByEngagement.map((e) => ({ key: e.key, label: engagementLabel(e.key), value: e.count }))
  const hearingRows = stats.hearingsByStatus.map((h) => ({ key: h.key, label: hearingStatusLabels[h.key] ?? h.key, value: h.count }))
  const causeRows = stats.adjournmentsByCause.map((h) => ({ key: h.key, label: reasonLabel(h.key), value: h.count }))
  const registerRows = stats.registerByKind.map((r) => {
    const [register, kind] = r.key.split(':')
    return { key: r.key, label: `${registerLabel(register as 'oaths' | 'notarial')} · ${kindLabel(kind)}`, value: r.count }
  })
  const opened = stats.byType.reduce((a, t) => a + t.opened, 0)
  const closed = stats.byType.reduce((a, t) => a + t.closed, 0)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["stats.title"]()}</h1>
          <p>{m["stats.lead"]()}</p>
        </div>
        <div className="w-28">
          <Select items={yearItems} value={String(stats.year)} onValueChange={(v) => v && void navigate({ search: { year: Number(v) } })}>
            <SelectTrigger className="w-full" aria-label={m["stats.year"]()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {yearItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </header>

      <section aria-label={m["stats.figures"]()} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m["stats.deadlines"]()}
          icon={AlarmClockIcon}
          tint={stats.clocks.overdue > 0 ? 'rose' : 'emerald'}
          value={stats.clocks.overdue}
          meta={<Badge variant="secondary">{m["stats.deadlines_soon"]({ count: stats.clocks.soon })}</Badge>}
          caption={m["stats.deadlines_caption"]({ running: stats.clocks.running })}
        />
        <StatTile label={m["stats.billed"]()} icon={Invoice01Icon} tint="primary" value={ugx(stats.money.billed)} caption={m["stats.billed_caption"]({ year: stats.year })} />
        <StatTile label={m["stats.collected"]()} icon={Wallet01Icon} tint="emerald" value={ugx(stats.money.collected)} meta={<Badge variant="secondary">{m["stats.held"]({ amount: ugx(stats.money.heldForClients) })}</Badge>} caption={m["stats.collected_caption"]()} />
        <StatTile label={m["stats.time"]()} icon={Clock01Icon} tint="amber" value={hours(stats.minutesRecorded)} meta={<Badge variant="secondary">{m["stats.pro_bono_short"]({ hours: hours(stats.proBonoMinutes) })}</Badge>} caption={m["stats.time_caption"]()} />
      </section>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <section aria-labelledby="opened" className="page-section">
          <h2 id="opened">{m["stats.opened"]({ year: stats.year })}</h2>
          <p className="text-muted-foreground">{m["stats.opened_lead"]({ opened, closed })}</p>
          <MonthColumns values={stats.openedByMonth} year={stats.year} caption={m["stats.opened"]({ year: stats.year })} locale={locale} />
        </section>

        <section aria-labelledby="by-type" className="page-section">
          <h2 id="by-type">{m["stats.by_type"]()}</h2>
          {byType.some((r) => r.value > 0) ? <BarList rows={byType.filter((r) => r.value > 0)} caption={m["stats.by_type"]()} /> : <EmptyNote>{m["stats.none_open"]()}</EmptyNote>}
        </section>

        <section aria-labelledby="by-stage" className="page-section">
          <h2 id="by-stage">{m["stats.by_stage"]()}</h2>
          {stageRows.length > 0 ? <BarList rows={stageRows} caption={m["stats.by_stage"]()} /> : <EmptyNote>{m["stats.none_open"]()}</EmptyNote>}
        </section>

        <section aria-labelledby="engagement" className="page-section">
          <h2 id="engagement">{m["stats.engagement"]()}</h2>
          {engagementRows.length > 0 ? <BarList rows={engagementRows} caption={m["stats.engagement"]()} /> : <EmptyNote>{m["stats.none_year"]()}</EmptyNote>}
        </section>

        <section aria-labelledby="hearings" className="page-section">
          <h2 id="hearings">{m["stats.hearings"]()}</h2>
          {hearingRows.length > 0 ? <BarList rows={hearingRows} caption={m["stats.hearings"]()} /> : <EmptyNote>{m["stats.none_year"]()}</EmptyNote>}
          {causeRows.length > 0 && (
            <>
              <h3>{m["stats.adjourned_why"]()}</h3>
              <BarList rows={causeRows} caption={m["stats.adjourned_why"]()} />
            </>
          )}
        </section>

        {registerRows.length > 0 && (
          <section aria-labelledby="registers" className="page-section">
            <h2 id="registers">{m["stats.registers"]()}</h2>
            <BarList rows={registerRows} caption={m["stats.registers"]()} />
          </section>
        )}
      </div>

      {compliance && compliance.advocates.length > 0 && (
        <section aria-labelledby="compliance" className="page-section">
          <h2 id="compliance">{m["stats.compliance"]()}</h2>
          <p className="text-muted-foreground">{m["stats.compliance_lead"]()}</p>
          <ul className="not-typeset flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
            {compliance.advocates.map((a) => {
              const pct = Math.min(100, (a.proBonoMinutes / compliance.targetMinutes) * 100)
              return (
                <li key={a.staffId} className="grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[minmax(0,12rem)_auto_minmax(0,1fr)]">
                  <div className="flex flex-col">
                    <span className="text-foreground">{a.name}</span>
                    <span className="text-sm text-muted-foreground">{a.practisingNumber ?? m["stats.no_number"]()}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CertificateTag state={a.certificate} />
                    <Tag tone={a.ulsPaidYear === compliance.year ? 'done' : 'open'}>{a.ulsPaidYear ? m["stats.uls_paid"]({ year: a.ulsPaidYear }) : m["stats.uls_unknown"]()}</Tag>
                    {a.commissionerSince && <Tag tone="neutral">{m["stats.commissioner"]()}</Tag>}
                    {a.notarySince && <Tag tone="neutral">{m["stats.notary"]()}</Tag>}
                  </div>
                  <div className="flex items-center gap-3" title={m["stats.pro_bono_of"]({ hours: hours(a.proBonoMinutes), target: hours(compliance.targetMinutes) })}>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-sm tabular-nums text-foreground">{m["stats.pro_bono_of"]({ hours: hours(a.proBonoMinutes), target: hours(compliance.targetMinutes) })}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          {compliance.otherProBonoMinutes > 0 && <p className="text-muted-foreground">{m["stats.pro_bono_other"]({ hours: hours(compliance.otherProBonoMinutes) })}</p>}
          <p className="text-muted-foreground">{m["stats.pro_bono_note"]()}</p>
        </section>
      )}
    </article>
  )
}
