import { Sparkline } from '@/components/charts/sparkline'
import { Createpanel } from '@/components/create-panel'
import { AttentionItem, type AttentionItemData } from '@/components/list-cards/attention-item'
import { CaseRow, type CaseRowData } from '@/components/list-cards/case-row'
import { StatTile } from '@/components/stat-tile'
import { activitySeverity, useRecentActivity } from '@/features/activity'
import { caseStatuses, useCases, type Case } from '@/features/cases'
import { custodyCompliance, useCustodyRecords, type CustodyRecord } from '@/features/custody'
import { useDutyAssignments } from '@/features/duty'
import { useBackupAlerts } from '@/features/officers'
import { useReferrals } from '@/features/referrals'
import { StationDiaryEntryForm, useStationDiaryEntries, type StationDiaryEntry } from '@/features/station-diary'
import { useStatements } from '@/features/statements'
import { useStationProfile } from '@/features/station-admin'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { DAY_MS, weeklyBuckets } from '@/lib/weekly-buckets'
import {
  Add01Icon,
  AlarmClockIcon,
  AlertCircleIcon,
  ArrowRight01Icon,
  Building06Icon,
  CellsIcon,
  File02Icon,
  Notebook01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { NeedsAttention } from './needs-attention'

function isSameCalendarDay(a: number, b: number) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function relativeTime(ms: number) {
  const diff = Date.now() - ms
  const hours = Math.floor(diff / (60 * 60 * 1000))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function caseStatusLabel(status: string) {
  return caseStatuses.find((s) => s.value === status)?.label ?? status
}

export function OverviewPage() {
  const [sdOpen, setSdOpen] = useState(false)
  const { data: custodyRecords } = useCustodyRecords('')
  const { data: cases } = useCases('')
  const { data: sdEntries } = useStationDiaryEntries('')
  const { data: dutyAssignments } = useDutyAssignments('')
  const { data: statements } = useStatements('')
  const { data: stationProfile } = useStationProfile()
  const { data: backupAlerts } = useBackupAlerts()
  const activeBackupAlerts = backupAlerts.filter((a) => a.endedAt == null)
  const { data: activityItems } = useRecentActivity()

  const now = Date.now()

  const inCustody = useMemo(() => custodyRecords.filter((r: CustodyRecord) => r.status === 'in_custody'), [custodyRecords])
  const nearOrOverLimit = useMemo(
    () => inCustody.filter((r) => { const c = custodyCompliance(r); return c.isOverdue || c.hoursRemaining < 6 }),
    [inCustody],
  )
  const over24h = useMemo(() => inCustody.filter((r) => now - r.arrestedAt > DAY_MS), [inCustody, now])

  const { data: referrals } = useReferrals('')
  const referralsPending = referrals.filter((r) => r.status === 'pending').length

  const openCases = useMemo(() => cases.filter((c: Case) => c.status === 'open'), [cases])
  const closedCasesCount = cases.length - openCases.length

  const sdToday = useMemo(() => sdEntries.filter((e: StationDiaryEntry) => isSameCalendarDay(e.createdAt, now)), [sdEntries, now])
  const sdYesterday = useMemo(
    () => sdEntries.filter((e: StationDiaryEntry) => isSameCalendarDay(e.createdAt, now - DAY_MS)),
    [sdEntries, now],
  )
  const sdTrendDelta = sdYesterday.length > 0 ? Math.round(((sdToday.length - sdYesterday.length) / sdYesterday.length) * 100) : null

  const onDutyNow = useMemo(
    () => dutyAssignments.filter((d) => d.shiftStart <= now && now <= d.shiftEnd).length,
    [dutyAssignments, now],
  )
  const rosterSize = useMemo(() => new Set(dutyAssignments.map((d) => d.officerName)).size, [dutyAssignments])

  const caseRows: CaseRowData[] = useMemo(
    () =>
      [...openCases]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((c) => ({
          reference: c.reference,
          title: c.summary,
          status: c.status,
          statusLabel: caseStatusLabel(c.status),
          subtitle: `${c.peopleCount} ${c.peopleCount === 1 ? 'person' : 'people'} · opened ${relativeTime(c.createdAt)}`,
        })),
    [openCases],
  )

  const activityRows = useMemo(
    () =>
      (activityItems ?? []).slice(0, 8).map((item) => ({
        item: {
          label: item.title,
          detail: item.subtitle || 'No detail',
          time: relativeTime(item.occurredAt),
          severity: activitySeverity(item),
        } satisfies AttentionItemData,
        route: item.route,
        id: item.id,
      })),
    [activityItems],
  )

  const flowBuckets = useMemo(() => weeklyBuckets(cases.map((c) => c.createdAt)), [cases])
  const flowPeak = Math.max(1, ...flowBuckets)

  return (
    <article className="page">
      {activeBackupAlerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-0">
          <CardContent className={cn(
            "flex flex-col sm:flex-row items-start",
            'sm:items-center justify-between gap-3 py-2.5 px-4'
          )}>
            <div className="flex md:items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className={cn(
                  "absolute inline-flex h-full w-full animate-ping",
                  'rounded-full bg-destructive opacity-75'
                )}></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-destructive"></span>
              </span>
              <div className={cn(
                "flex flex-col sm:flex-row md:items-center",
                'md:gap-3'
              )}>
                <h3>Backup Requested</h3>
                <span className="hidden md:block">•</span>
                <p>
                  {activeBackupAlerts.length} {activeBackupAlerts.length === 1 ? 'officer needs' : 'officers need'}{' '}
                  backup right now.
                </p>
              </div>
            </div>
            <Link to="/logs/backup-alerts" className={buttonVariants({ size: 'xs', variant: 'destructive' })}>
              Respond
            </Link>
          </CardContent>
        </Card>
      )}

      {nearOrOverLimit.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-0">
          <CardContent className={cn(
            "flex flex-col sm:flex-row items-start",
            'sm:items-center justify-between gap-3 py-2.5 px-4'
          )}>
            <div className="flex md:items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className={cn(
                  "absolute inline-flex h-full w-full animate-ping",
                  'rounded-full bg-amber-400 opacity-75'
                )}></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-amber-500"></span>
              </span>
              <div className={cn(
                "flex flex-col sm:flex-row md:items-center",
                'md:gap-3'
              )}>
                <h3>
                  48h Custody Alert
                </h3>
                <span className="hidden md:block">•</span>
                <p>
                  {nearOrOverLimit.length} {nearOrOverLimit.length === 1 ? 'suspect is' : 'suspects are'} at or near the 48-hour constitutional limit.
                </p>
              </div>
            </div>
            <Link to="/search/custody" className={buttonVariants({ size: 'xs' })}>
              Review Cell Log
            </Link>
          </CardContent>
        </Card>
      )}

      <section className='flex flex-col gap-3 md:flex-row md:justify-between md:items-center'>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <HugeiconsIcon icon={Building06Icon} className="size-4" />
            <div className='flex flex-wrap items-center text-xs gap-5'>
              <span className='truncate'>
                {[stationProfile?.name, stationProfile?.address].filter(Boolean).join(' · ') || 'Station not yet configured'}
              </span>
              <span>•</span>
              <span className='truncate'>{new Date(now).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          <h1>Station Overview</h1>
        </div>

        <div className="flex items-center gap-1 col-span-6">
          <Link to="/roster" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            <HugeiconsIcon icon={UserGroupIcon} />
            <strong>{onDutyNow}</strong>
            / {rosterSize} Officers on Duty
          </Link>

          <Createpanel
            open={sdOpen}
            onOpenChange={setSdOpen}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={Add01Icon} />
                New SD Entry
              </Button>
            }
            headings={{ title: 'New station diary entry', description: 'Log counter or shift activity.' }}
          >
            <StationDiaryEntryForm onSuccess={() => setSdOpen(false)} />
          </Createpanel>
        </div>
      </section>

      <section aria-label="Figures" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Cell lock-up"
          icon={CellsIcon}
          tint="primary"
          value={inCustody.length}
          meta={<Badge variant="secondary">{over24h.length} over 24h</Badge>}
          caption={`${custodyRecords.length} custody records logged`}
        />
        <StatTile
          label="Near the 48h limit"
          icon={AlarmClockIcon}
          tint={nearOrOverLimit.length > 0 ? 'rose' : 'emerald'}
          value={nearOrOverLimit.length}
          meta={<Badge variant={nearOrOverLimit.length > 0 ? 'destructive' : 'secondary'}>{nearOrOverLimit.length > 0 ? 'Action needed' : 'Clear'}</Badge>}
          caption="Approaching or past the limit"
        />
        <StatTile
          label="Diary entries today"
          icon={Notebook01Icon}
          tint="amber"
          value={sdToday.length}
          meta={
            sdTrendDelta !== null && (
              <span className={cn('flex items-center font-medium', sdTrendDelta >= 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                {sdTrendDelta >= 0 ? '+' : ''}
                {sdTrendDelta}%
              </span>
            )
          }
          caption={`vs ${sdYesterday.length} yesterday`}
        />
        <StatTile
          label="Open cases"
          icon={File02Icon}
          tint="primary"
          value={openCases.length}
          meta={<Badge variant="outline">{closedCasesCount} closed</Badge>}
          caption={`${statements.length} statements recorded`}
        />
        <StatTile
          label="Backup requests"
          icon={AlertCircleIcon}
          tint={activeBackupAlerts.length > 0 ? 'rose' : 'emerald'}
          value={activeBackupAlerts.length}
          meta={<Badge variant={activeBackupAlerts.length > 0 ? 'destructive' : 'secondary'}>{activeBackupAlerts.length > 0 ? 'Respond' : 'None active'}</Badge>}
          caption={`${backupAlerts.length} total, over remote access`}
        />
      </section>

      <NeedsAttention inCustody={inCustody} referralsPending={referralsPending} />

      <section className="grid grid-cols-12 gap-6">
        <div className="flex flex-col gap-4 col-span-12 lg:col-span-7">
          <div className="flex justify-between">
            <div className='flex flex-col'>
              <h2>Recent Activity</h2>
              <p>What's happening across the station</p>
            </div>
          </div>

          <Card className='p-0'>
            <CardContent className="p-0 divide-y divide-border/60">
              {activityRows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nothing recorded yet.</p>}
              {activityRows.map((row) => (
                <Link
                  key={row.id}
                  {...(parseSearchRoute(row.route) as any)}
                  className="block px-3 py-1 transition-colors hover:bg-muted/60"
                >
                  <AttentionItem item={row.item} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 col-span-12 lg:col-span-5">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between">
              <div className='flex flex-col'>
                <h2>My Investigation Files</h2>
                <p>Open cases</p>
              </div>
              <Link to="/intake" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                View All
                <HugeiconsIcon icon={ArrowRight01Icon} />
              </Link>
            </div>

            <Card className='p-0'>
              <CardContent className="p-0 divide-y divide-border/60">
                {caseRows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No open cases.</p>}
                {caseRows.map((row) => (
                  <CaseRow key={row.reference} row={row} />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="p-0">
            <CardContent className='p-0'>
              <div className="flex justify-between p-5">
                <h2>8-Week Case Intake Trend</h2>
                <p className="tabular-nums">Peak: {flowPeak} cases/wk</p>
              </div>
              <Sparkline data={flowBuckets} />
            </CardContent>
          </Card>
        </div>
      </section>
    </article>
  )
}
