import { Sparkline } from '@/components/charts/sparkline'
import { isIntakeAlertsEnabled, setIntakeAlertsEnabled, useIntakeAlerts } from '@/hooks/use-intake-alerts'
import { fileStatusLabel, intakeQueueOptions, prosecutionFilesOptions, useIntakeQueue, useProsecutionFiles } from '@/features/prosecution-files'
import { peopleOptions, usePeople } from '@/features/people'
import { DAY_MS, weeklyBuckets } from '@/lib/weekly-buckets'
import { AlertCircleIcon, ArrowRight01Icon, File02Icon, Notification01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
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
      context.queryClient.query({ ...intakeQueueOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...prosecutionFilesOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...peopleOptions(''), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

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
 * trend chart), same shape as Police's/Prisons' own Overview (docs/dpp/
 * PRODUCT.md §Work Queues): every bucket here is a real, confirmed review
 * trigger or a plain derived count, never an invented metric. Only the
 * intake backlog is wired so far — the Threshold Test 14-day review, the
 * 3-adjournment trigger, and upcoming trial-date notices depend on Court
 * Matters data this slice doesn't build yet.
 */
function RouteComponent() {
  const { data: intake } = useIntakeQueue()
  const { data: files } = useProsecutionFiles('')
  const { data: people } = usePeople('')
  const [alertsEnabled, setAlertsEnabled] = useState(isIntakeAlertsEnabled)
  useIntakeAlerts()

  const now = Date.now()
  const underReview = useMemo(() => files.filter((f) => f.currentStatus === 'under_review'), [files])
  const resolvedCount = files.length - underReview.length

  const receivedToday = useMemo(() => files.filter((f) => now - f.receivedAt < DAY_MS), [files, now])
  const receivedYesterday = useMemo(
    () => files.filter((f) => now - f.receivedAt >= DAY_MS && now - f.receivedAt < DAY_MS * 2),
    [files, now],
  )
  const receivedTrendDelta =
    receivedYesterday.length > 0 ? Math.round(((receivedToday.length - receivedYesterday.length) / receivedYesterday.length) * 100) : null

  const intakeBuckets = useMemo(() => weeklyBuckets(files.map((f) => f.receivedAt)), [files])
  const intakePeak = Math.max(1, ...intakeBuckets)

  const recentFiles = useMemo(() => [...files].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 5), [files])

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      {intake.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-0">
          <CardContent className={cn('flex flex-col sm:flex-row items-start', 'sm:items-center justify-between gap-3 py-2.5 px-4')}>
            <div className="flex md:items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className={cn('absolute inline-flex h-full w-full animate-ping', 'rounded-full bg-destructive opacity-75')}></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-destructive"></span>
              </span>
              <div className={cn('flex flex-col sm:flex-row md:items-center', 'md:gap-3')}>
                <h3>Awaiting a Charging Decision</h3>
                <span className="hidden md:block">•</span>
                <p>
                  {intake.length} {intake.length === 1 ? 'file is' : 'files are'} waiting on a charging decision.
                </p>
              </div>
            </div>
            <Link to="/intake" className={buttonVariants({ size: 'xs', variant: 'destructive' })}>
              Review Intake
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
              setIntakeAlertsEnabled(checked)
              setAlertsEnabled(checked)
            }}
          />
        </label>
      </section>

      <section className="grid grid-cols-2 md:flex md:flex-wrap gap-3">
        <StatTile
          label="Awaiting Decision"
          labelClassName={intake.length > 0 ? 'text-primary' : undefined}
          icon={AlertCircleIcon}
          iconClassName={intake.length > 0 ? 'text-primary' : undefined}
          value={String(intake.length).padStart(2, '0')}
          meta={<Badge variant={intake.length > 0 ? 'destructive' : 'secondary'}>{intake.length > 0 ? 'Action Needed' : 'OK'}</Badge>}
          caption="Files awaiting a charging decision"
        />

        <StatTile
          label="Under Review"
          icon={File02Icon}
          value={underReview.length}
          meta={<Badge variant="outline">{resolvedCount} resolved</Badge>}
          caption={`${files.length} total files opened`}
        />

        <StatTile
          label="Received Today"
          icon={File02Icon}
          value={receivedToday.length}
          meta={
            receivedTrendDelta !== null && (
              <span className={cn('flex items-center font-medium', receivedTrendDelta >= 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                {receivedTrendDelta >= 0 ? '+' : ''}
                {receivedTrendDelta}%
              </span>
            )
          }
          caption={`vs ${receivedYesterday.length} yesterday`}
        />

        <StatTile
          label="People Tracked"
          icon={UserGroupIcon}
          value={people.length}
          caption="Accused, complainants, and witnesses"
        />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <div className="flex flex-col gap-4 col-span-12 lg:col-span-7">
          <div className="flex justify-between">
            <div className="flex flex-col">
              <h2>Recent Files</h2>
              <p>Most recently received files</p>
            </div>
            <Link to="/files" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              View All
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Link>
          </div>

          <Card className="p-0">
            <CardContent className="p-0 divide-y divide-border/60">
              {recentFiles.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No files opened yet.</p>}
              {recentFiles.map((file) => (
                <Link
                  key={file.id}
                  to="/files"
                  search={{ open: file.id }}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{file.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {file.odppRegistrationNumber ?? 'No ODPP reg. no. yet'}
                      {file.policeStation ? ` · ${file.policeStation}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{fileStatusLabel(file.currentStatus)}</Badge>
                    <span className="text-xs text-muted-foreground">{format(file.receivedAt, 'PP')}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 col-span-12 lg:col-span-5">
          <Card className="p-0">
            <CardContent className="p-0">
              <div className="flex justify-between p-5">
                <h2>8-Week Intake Trend</h2>
                <p className="tabular-nums">Peak: {intakePeak}/wk</p>
              </div>
              <Sparkline data={intakeBuckets} />
            </CardContent>
          </Card>
        </div>
      </section>
    </article>
  )
}
