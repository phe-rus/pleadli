import { Sparkline } from '@/components/charts/sparkline'
import { StatTile } from '@/components/stat-tile'
import { isHospitalisedAlertsEnabled, setHospitalisedAlertsEnabled, useHospitalisedAlerts } from '@/hooks/use-hospitalised-alerts'
import { isMandatoryBailAlertsEnabled, setMandatoryBailAlertsEnabled, useMandatoryBailAlerts } from '@/hooks/use-mandatory-bail-alerts'
import { usePendingFacilityAlerts } from '@/hooks/use-pending-facility-alerts'
import { mandatoryBailThresholdDays, daysInCustody, prisonerFullName } from '@/features/prisoners'
import { inCustodyOptions, useInCustody, usePrisoners, prisonersOptions } from '@/features/prisoners/queries'
import { remandListOptions, useRemandList } from '@/features/court-productions'
import { healthEventTypeLabel, hospitalisedOptions, useHospitalised } from '@/features/health-events'
import { useFacilities, facilitiesOptions } from '@/features/facilities'
import { useHqConfig } from '@/features/session'
import { weeklyBuckets } from '@/lib/weekly-buckets'
import {
  CellsIcon,
  AlarmClockIcon,
  HeartAddIcon,
  ArrowRight01Icon,
  Notification01Icon,
  NetworkIcon,
  PauseIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
} from '@hugeicons/core-free-icons'
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
      context.queryClient.query({ ...facilitiesOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Head Office and a facility are different installations of the same
 * app, not the same screen with different data (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md: "Head Office is
 * purely an aggregator with no prisoners of its own"). Showing a
 * facility's custody stat tiles on a Head Office install would be
 * actively wrong, not just unpolished, so this branches on role rather
 * than reusing one dashboard for both. */
function RouteComponent() {
  const { data: hqConfig, isLoading } = useHqConfig()
  if (isLoading) return null
  return hqConfig?.isHeadOffice ? <HqOverview /> : <FacilityOverview />
}

/**
 * Head Office oversees the national estate, not individual prisoners: it
 * has none of its own. This is deliberately a different shape from the
 * Facility Overview below (facility counts, not prisoner counts). The
 * full roster with per-facility detail lives at its own `/facilities`
 * page now, not embedded here — Overview stays a glance-only dashboard,
 * matching the same page-for-management/dashboard-for-glance split every
 * other domain in this app already follows.
 */
function HqOverview() {
  const { data: facilities } = useFacilities()
  usePendingFacilityAlerts()
  const all = facilities ?? []
  const pending = all.filter((f) => f.status === 'pending_verification')
  const active = all.filter((f) => f.status === 'active')
  const revoked = all.filter((f) => f.status === 'revoked')

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={NetworkIcon} size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1>Head Office Overview</h1>
            <p className="md:max-w-sm">Every paired facility, at a glance.</p>
          </div>
        </div>
        <Link to="/facilities" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
          View Facilities
          <HugeiconsIcon icon={ArrowRight01Icon} />
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Registered Facilities"
          icon={NetworkIcon}
          tint="primary"
          value={all.length}
          caption="Paired with this Head Office"
        />
        <StatTile
          label="Pending Verification"
          icon={Clock01Icon}
          tint={pending.length > 0 ? 'amber' : 'emerald'}
          value={pending.length}
          meta={pending.length > 0 && <Badge variant="destructive">Needs review</Badge>}
          caption="Waiting on an emailed verification code"
        />
        <StatTile label="Active" icon={CheckmarkCircle02Icon} tint="emerald" value={active.length} caption="Pushing their prisoner roster" />
        <StatTile
          label="Revoked"
          icon={PauseIcon}
          tint={revoked.length > 0 ? 'rose' : 'emerald'}
          value={revoked.length}
          caption="No longer able to sync"
        />
      </section>

      {all.length === 0 && (
        <Card className="border-dashed p-0">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={NetworkIcon} size={20} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">No facilities paired yet</h3>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generating a pairing code for a new facility, and reviewing its email verification, are the next slice
                of this build — not available yet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </article>
  )
}

/**
 * "What needs my attention" plus real system awareness (stat tiles, a
 * trend chart), same shape as Police's own Overview — docs/prisons/
 * PRODUCT.md §Work Queues: every number here traces to a confirmed
 * statutory trigger or a plain derived count, nothing invented.
 */
function FacilityOverview() {
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="In Custody"
          icon={CellsIcon}
          tint="primary"
          value={inCustody.length}
          caption={`${allPrisoners.length} total prisoner records`}
        />

        <StatTile
          label="Mandatory-Bail Alerts"
          icon={AlarmClockIcon}
          tint={overThreshold.length > 0 ? 'rose' : 'emerald'}
          value={overThreshold.length}
          meta={<Badge variant={overThreshold.length > 0 ? 'destructive' : 'secondary'}>{overThreshold.length > 0 ? 'Action needed' : 'OK'}</Badge>}
          caption="Past the 60/180-day constitutional threshold"
        />

        <StatTile
          label="Hospitalised"
          icon={HeartAddIcon}
          tint={hospitalised.length > 0 ? 'amber' : 'emerald'}
          value={hospitalised.length}
          meta={<Badge variant={hospitalised.length > 0 ? 'destructive' : 'secondary'}>{hospitalised.length > 0 ? 'Awaiting return' : 'None'}</Badge>}
          caption="Currently away at a hospital"
        />

        <StatTile
          label="Admitted Today"
          icon={CellsIcon}
          tint="primary"
          value={admittedToday.length}
          meta={
            admissionTrendDelta !== null && (
              <span className={cn('flex items-center text-sm font-medium', admissionTrendDelta >= 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
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
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium">8-Week Admissions Trend</h2>
                <p className="text-xs tabular-nums text-muted-foreground">Peak: {admissionPeak}/wk</p>
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <Sparkline data={admissionBuckets} className="h-16" />
              </div>
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
