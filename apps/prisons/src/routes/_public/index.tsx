import { Sparkline } from '@/components/charts/sparkline'
import { isHospitalisedAlertsEnabled, setHospitalisedAlertsEnabled, useHospitalisedAlerts } from '@/hooks/use-hospitalised-alerts'
import { isMandatoryBailAlertsEnabled, setMandatoryBailAlertsEnabled, useMandatoryBailAlerts } from '@/hooks/use-mandatory-bail-alerts'
import { mandatoryBailThresholdDays, daysInCustody, prisonerFullName } from '@/features/prisoners'
import { inCustodyOptions, useInCustody, usePrisoners, prisonersOptions } from '@/features/prisoners/queries'
import { remandListOptions, useRemandList } from '@/features/court-productions'
import { healthEventTypeLabel, hospitalisedOptions, useHospitalised } from '@/features/health-events'
import { weeklyBuckets } from '@/lib/weekly-buckets'
import { CellsIcon, AlarmClockIcon, HeartAddIcon, ArrowRight01Icon, Notification01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...inCustodyOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remandListOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...hospitalisedOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...prisonersOptions(''), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

const DAY_MS = 24 * 60 * 60 * 1000

type StatTileProps = {
  label: string
  labelClassName?: string
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  iconClassName?: string
  value: React.ReactNode
  meta?: React.ReactNode
  caption: React.ReactNode
}

function StatTile({ label, labelClassName, icon, iconClassName, value, meta, caption }: StatTileProps) {
  return (
    <Card className="p-0 h-fit md:min-w-3xs! md:max-w-3xs!">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <h3 className={labelClassName}>{label}</h3>
          <HugeiconsIcon icon={icon} className={cn('size-5', iconClassName)} />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-5xl font-semibold tabular-nums">{value}</span>
          {meta}
        </div>
        <p>{caption}</p>
      </CardContent>
    </Card>
  )
}

/**
 * "What needs my attention" plus real system awareness (stat tiles, a
 * trend chart), same shape as Police's own Overview — docs/prisons/
 * PRODUCT.md §Work Queues: every number here traces to a confirmed
 * statutory trigger or a plain derived count, nothing invented.
 */
function RouteComponent() {
  const { data: inCustody } = useInCustody()
  const { data: remand } = useRemandList()
  const { data: hospitalised } = useHospitalised()
  const { data: allPrisoners } = usePrisoners('')
  const [alertsEnabled, setAlertsEnabled] = useState(() => isMandatoryBailAlertsEnabled() && isHospitalisedAlertsEnabled())
  useMandatoryBailAlerts()
  useHospitalisedAlerts()

  const now = Date.now()
  const overThreshold = useMemo(
    () => remand.filter((entry) => daysInCustody(entry.admittedAt) >= mandatoryBailThresholdDays(entry.highCourtOnlyOffence)),
    [remand],
  )

  const admittedToday = useMemo(
    () => inCustody.filter((p) => now - p.admittedAt < DAY_MS),
    [inCustody, now],
  )
  const admittedYesterday = useMemo(
    () => allPrisoners.filter((p) => now - p.admittedAt >= DAY_MS && now - p.admittedAt < DAY_MS * 2),
    [allPrisoners, now],
  )
  const admissionTrendDelta =
    admittedYesterday.length > 0 ? Math.round(((admittedToday.length - admittedYesterday.length) / admittedYesterday.length) * 100) : null

  const admissionBuckets = useMemo(() => weeklyBuckets(allPrisoners.map((p) => p.admittedAt)), [allPrisoners])
  const admissionPeak = Math.max(1, ...admissionBuckets)

  const recentAdmissions = useMemo(() => [...allPrisoners].sort((a, b) => b.admittedAt - a.admittedAt).slice(0, 5), [allPrisoners])

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      {overThreshold.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-0">
          <CardContent className={cn('flex flex-col sm:flex-row items-start', 'sm:items-center justify-between gap-3 py-2.5 px-4')}>
            <div className="flex md:items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className={cn('absolute inline-flex h-full w-full animate-ping', 'rounded-full bg-destructive opacity-75')}></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-destructive"></span>
              </span>
              <div className={cn('flex flex-col sm:flex-row md:items-center', 'md:gap-3')}>
                <h3>Mandatory-Bail Alert</h3>
                <span className="hidden md:block">•</span>
                <p>
                  {overThreshold.length} {overThreshold.length === 1 ? 'prisoner is' : 'prisoners are'} past their constitutional
                  mandatory-bail threshold.
                </p>
              </div>
            </div>
            <Link to="/remand" className={buttonVariants({ size: 'xs', variant: 'destructive' })}>
              Review Remand List
            </Link>
          </CardContent>
        </Card>
      )}

      {hospitalised.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-0">
          <CardContent className={cn('flex flex-col sm:flex-row items-start', 'sm:items-center justify-between gap-3 py-2.5 px-4')}>
            <div className="flex md:items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className={cn('absolute inline-flex h-full w-full animate-ping', 'rounded-full bg-amber-400 opacity-75')}></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-amber-500"></span>
              </span>
              <div className={cn('flex flex-col sm:flex-row md:items-center', 'md:gap-3')}>
                <h3>Hospitalised</h3>
                <span className="hidden md:block">•</span>
                <p>
                  {hospitalised.length} {hospitalised.length === 1 ? 'prisoner is' : 'prisoners are'} currently away at a hospital.
                </p>
              </div>
            </div>
            <Link to="/prisoners" className={buttonVariants({ size: 'xs' })}>
              View Prisoners
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Overview</h1>
          <p className="md:max-w-sm">What needs your attention.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Notification01Icon} className="size-4" />
          Desktop alerts
          <Switch
            checked={alertsEnabled}
            onCheckedChange={(checked) => {
              setMandatoryBailAlertsEnabled(checked)
              setHospitalisedAlertsEnabled(checked)
              setAlertsEnabled(checked)
            }}
          />
        </label>
      </section>

      <section className="grid grid-cols-2 md:flex md:flex-wrap gap-3">
        <StatTile
          label="In Custody"
          icon={CellsIcon}
          value={inCustody.length}
          caption={`${allPrisoners.length} total prisoner records`}
        />

        <StatTile
          label="Mandatory-Bail Alerts"
          labelClassName={overThreshold.length > 0 ? 'text-primary' : undefined}
          icon={AlarmClockIcon}
          iconClassName={overThreshold.length > 0 ? 'text-primary' : undefined}
          value={String(overThreshold.length).padStart(2, '0')}
          meta={<Badge variant={overThreshold.length > 0 ? 'destructive' : 'secondary'}>{overThreshold.length > 0 ? 'Action Needed' : 'OK'}</Badge>}
          caption="Past the 60/180-day constitutional threshold"
        />

        <StatTile
          label="Hospitalised"
          labelClassName={hospitalised.length > 0 ? 'text-primary' : undefined}
          icon={HeartAddIcon}
          iconClassName={hospitalised.length > 0 ? 'text-primary' : undefined}
          value={hospitalised.length}
          meta={<Badge variant={hospitalised.length > 0 ? 'destructive' : 'secondary'}>{hospitalised.length > 0 ? 'Awaiting return' : 'None'}</Badge>}
          caption="Currently away at a hospital"
        />

        <StatTile
          label="Admitted Today"
          icon={CellsIcon}
          value={admittedToday.length}
          meta={
            admissionTrendDelta !== null && (
              <span className={cn('flex items-center font-medium', admissionTrendDelta >= 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                {admissionTrendDelta >= 0 ? '+' : ''}
                {admissionTrendDelta}%
              </span>
            )
          }
          caption={`vs ${admittedYesterday.length} yesterday`}
        />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <div className="flex flex-col gap-4 col-span-12 lg:col-span-7">
          <div className="flex justify-between">
            <div className="flex flex-col">
              <h2>Recent Admissions</h2>
              <p>Most recently admitted prisoners</p>
            </div>
            <Link to="/prisoners" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              View All
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Link>
          </div>

          <Card className="p-0">
            <CardContent className="p-0 divide-y divide-border/60">
              {recentAdmissions.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No prisoners admitted yet.</p>}
              {recentAdmissions.map((p) => (
                <Link
                  key={p.id}
                  to="/prisoners"
                  search={{ open: p.id }}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{prisonerFullName(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">Admitted {format(p.admittedAt, 'PPp')}</p>
                  </div>
                  <Badge variant="outline">{p.currentStatus}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 col-span-12 lg:col-span-5">
          <Card className="p-0">
            <CardContent className="p-0">
              <div className="flex justify-between p-5">
                <h2>8-Week Admissions Trend</h2>
                <p className="tabular-nums">Peak: {admissionPeak}/wk</p>
              </div>
              <Sparkline data={admissionBuckets} />
            </CardContent>
          </Card>

          {hospitalised.length > 0 && (
            <Card className="p-0">
              <CardContent className="p-0 divide-y divide-border/60">
                <div className="p-3">
                  <h2 className="text-sm font-medium">Currently hospitalised</h2>
                </div>
                {hospitalised.map((entry) => (
                  <Link
                    key={entry.prisonerId}
                    to="/prisoners"
                    search={{ open: entry.prisonerId }}
                    className={cn('flex items-center justify-between gap-3 px-3 py-2 text-sm', 'hover:bg-muted/60')}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{prisonerFullName({ firstName: entry.firstName, lastName: entry.lastName, otherNames: null })}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Since {format(entry.occurredAt, 'PP')}
                        {entry.facilityName ? ` · ${entry.facilityName}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline">{healthEventTypeLabel(entry.eventType)}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </article>
  )
}
