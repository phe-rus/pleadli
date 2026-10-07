import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { useRecentActivity } from '@/features/activity'
import { useCases } from '@/features/cases'
import { custodyCompliance, custodyPersonName, useCustodyRecords } from '@/features/custody'
import { useDutyAssignments } from '@/features/duty'
import { useBackupAlerts } from '@/features/officers'
import { useReferrals } from '@/features/referrals'
import { StationDiaryEntryForm, useStationDiaryEntries } from '@/features/station-diary'
import { useStationCounts } from '@/features/workspace/station-counts'
import { format, formatDistanceToNowStrict } from '@/lib/date'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { CheckmarkCircle02Icon, Share08Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { Link, useNavigate } from '@tanstack/react-router'

/** Someone in the cells is listed under the time limits once the record puts
 * them this close to the limit, or past it. */
const LISTED_WITHIN_HOURS = 12

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function hoursPhrase(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return m["custody.minutes"]({ count: Math.max(1, Math.round(abs * 60)) })
  return Math.round(abs) === 1 ? m["custody.hour_one"]() : m["custody.hours"]({ count: Math.round(abs) })
}

/** The station's day: anything that cannot wait, then how the station stands,
 * then what has just happened. Every line is read from the record; a part with
 * nothing behind it does not appear. One action: a new diary entry. */
export function OverviewPage() {
  const navigate = useNavigate()
  const now = Date.now()
  const { data: custody } = useCustodyRecords('')
  const { data: diary } = useStationDiaryEntries('')
  const { data: duty } = useDutyAssignments('')
  const { data: backup } = useBackupAlerts()
  const { data: referrals } = useReferrals('')
  const { data: cases } = useCases('')
  const { data: activity = [] } = useRecentActivity()
  const counts = useStationCounts()

  const limits = custody
    .filter((r) => r.status === 'in_custody')
    .map((record) => ({ record, compliance: custodyCompliance(record) }))
    .filter(({ compliance }) => compliance.hoursRemaining <= LISTED_WITHIN_HOURS)
    .sort((a, b) => a.compliance.deadline - b.compliance.deadline)
  const liveBackup = backup.filter((a) => a.endedAt == null)

  const pendingReferrals = referrals.filter((r) => r.status === 'pending')
  const caseRef = (caseId: string) => cases.find((c) => c.id === caseId)?.reference

  // Only figures with something behind them: a row of zeros tells nobody anything.
  const figures = [
    { id: 'cells', label: m["nav.in_custody"](), value: counts?.inCells ?? 0, to: '/search/custody' },
    { id: 'diary', label: m["today.diary_today"](), value: diary.filter((e) => sameDay(e.createdAt, now)).length, to: '/sd-log' },
    { id: 'cases', label: m["cases.folder.investigating"](), value: counts?.investigating ?? 0, to: '/investigations?view=investigating' },
    { id: 'duty', label: m["today.on_duty"](), value: duty.filter((d) => d.shiftStart <= now && now <= d.shiftEnd).length, to: '/roster' },
  ].filter((f) => f.value > 0)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{format(now, 'EEEE d MMMM')}</p>
          <h1>{m["nav.today"]()}</h1>
        </div>
        <div className="page-actions">
          <PanelButton label={m["overview.new_sd"]()} title={m["overview.new_sd_title"]()} description={m["overview.new_sd_desc"]()} variant="default">
            {({ close, setDirty }) => <StationDiaryEntryForm onDirtyChange={setDirty} onSuccess={close} />}
          </PanelButton>
        </div>
      </header>

      {(limits.length > 0 || liveBackup.length > 0) && (
        <section aria-labelledby="now" className="flex flex-col gap-2 rounded-xl bg-destructive/[0.06] p-4 ring-1 ring-destructive/20">
          <h2 id="now" className="text-destructive">{m["today.cannot_wait"]()}</h2>
          <ul className="flex list-none flex-col gap-1 p-0">
            {liveBackup.length > 0 && (
              <li>
                <Link to="/logs/backup-alerts" className="-mx-2 flex flex-col rounded-xl px-2 py-1.5 text-foreground no-underline hover:bg-destructive/10">
                  <strong>{liveBackup.length === 1 ? m["overview.backup_one"]() : m["overview.backup_n"]({ count: liveBackup.length })}</strong>
                  <span className="text-destructive">{m["today.backup_respond"]()}</span>
                </Link>
              </li>
            )}
            {limits.map(({ record, compliance }) => (
              <li key={record.id}>
                <Link to="/search/custody" className="-mx-2 flex flex-col rounded-xl px-2 py-1.5 text-foreground no-underline hover:bg-destructive/10">
                  <strong>{custodyPersonName(record)}</strong>
                  <span className={compliance.isOverdue ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'}>
                    {compliance.isOverdue
                      ? m["today.limit_past"]({ time: hoursPhrase(compliance.hoursRemaining), arrested: formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true }) })
                      : m["today.limit_near"]({ time: hoursPhrase(compliance.hoursRemaining), deadline: format(compliance.deadline, 'EEE p') })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {figures.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figures.map((f) => (
            <Stat key={f.id} label={f.label} value={f.value} onClick={() => void navigate(parseSearchRoute(f.to) as never)} />
          ))}
        </div>
      )}

      {pendingReferrals.length > 0 && (
        <Group title={m["today.waiting_reply"]()}>
          {pendingReferrals.slice(0, 5).map((r) => (
            <GroupRow
              key={r.id}
              icon={
                <RowIcon>
                  <HugeiconsIcon icon={Share08Icon} />
                </RowIcon>
              }
              label={caseRef(r.caseId) ?? r.caseReference}
              detail={m["today.referred_to"]({ destination: r.destinationName ?? '', when: formatDistanceToNowStrict(r.referredAt, { addSuffix: true }) })}
              chevron
              render={({ className, children }) => (
                <Link to="/investigations/$caseId" params={{ caseId: r.caseId }} className={className}>
                  {children}
                </Link>
              )}
            />
          ))}
        </Group>
      )}

      {limits.length === 0 && liveBackup.length === 0 && pendingReferrals.length === 0 && (
        <EmptyNote icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} />}>{m["attention.empty"]()}</EmptyNote>
      )}

      {activity.length > 0 && (
        <Group title={m["today.just_happened"]()}>
          {activity.slice(0, 8).map((item) => (
            <GroupRow
              key={item.id}
              label={item.title}
              detail={item.subtitle || undefined}
              value={<span className="text-xs">{formatDistanceToNowStrict(item.occurredAt, { addSuffix: true })}</span>}
              render={({ className, children }) => (
                <Link to={parseSearchRoute(item.route).to as never} search={parseSearchRoute(item.route).search as never} className={className}>
                  {children}
                </Link>
              )}
            />
          ))}
        </Group>
      )}
    </article>
  )
}
