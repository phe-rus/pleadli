import * as m from '@/paraglide/messages'
import { ActivityToasts } from '@/features/activity'
import { CustodyAttentionToasts } from '@/features/custody'
import { BackupDispatchIndicator } from '@/features/officers'
import { LicenceBar } from '@/features/orchestra'
import { DevModeSwitch, useInstallation, useMe } from '@/features/session'
import { format } from '@/lib/date'
import { useEffect, useState, type ReactNode } from 'react'
import { useStationCounts } from './station-counts'

export { LicenceBar }

/** A station's own alerts, live only while there is something to say; a command
 * holds none of these records. */
export function HeaderEnd() {
  const station = useInstallation().data?.mode === 'station'
  return (
    <>
      {station && (
        <>
          <BackupDispatchIndicator />
          <CustodyAttentionToasts />
          <ActivityToasts />
        </>
      )}
      {import.meta.env.DEV && <DevModeSwitch compact />}
    </>
  )
}

/** One reading in the bar: a small dot in the reading's colour, then what it counts. Only
 * readings with something behind them are shown, so a quiet station has a quiet bar. */
function Reading({ tone = 'neutral', children }: { tone?: 'neutral' | 'alert' | 'warn' | 'good'; children: ReactNode }) {
  const dot = { neutral: 'bg-muted-foreground/50', alert: 'bg-destructive', warn: 'bg-amber-500', good: 'bg-emerald-500' }[tone]
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap ${tone === 'alert' ? 'font-medium text-destructive' : ''}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{format(now, 'EEE d MMM, HH:mm')}</span>
}

/** The foot of the window: what is happening at the station right now, on the left, and where
 * the work is kept and who is doing it, on the right. */
export function StatusBar() {
  const counts = useStationCounts()
  const { data: me } = useMe()
  if (!counts) return null
  const warnings = counts.custodyOverdue + counts.custodyDue
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        <Reading>{counts.inCells === 1 ? m["workspace.custody_one"]() : m["workspace.custody_n"]({ count: counts.inCells })}</Reading>
        {counts.custodyOverdue > 0 && <Reading tone="alert">{m["workspace.past_limit"]({ count: counts.custodyOverdue })}</Reading>}
        {counts.custodyDue > 0 && <Reading tone="warn">{m["workspace.near_limit"]({ count: counts.custodyDue })}</Reading>}
        {counts.backupLive > 0 && <Reading tone="alert">{m["workspace.backup_live"]({ count: counts.backupLive })}</Reading>}
        {warnings === 0 && counts.inCells > 0 && <Reading tone="good">{m["workspace.within_limits"]()}</Reading>}
        {counts.onBond > 0 && <Reading>{m["workspace.on_bond"]({ count: counts.onBond })}</Reading>}
        {counts.investigating > 0 && <Reading>{m["workspace.investigating"]({ count: counts.investigating })}</Reading>}
        {counts.withDpp > 0 && <Reading>{m["workspace.with_dpp"]({ count: counts.withDpp })}</Reading>}
        {counts.referralsPending > 0 && <Reading>{m["workspace.referrals_waiting"]({ count: counts.referralsPending })}</Reading>}
        {counts.onDuty > 0 && <Reading>{m["workspace.on_duty"]({ count: counts.onDuty })}</Reading>}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {me && <span className="truncate">{me.name}</span>}
        <Reading tone="good">{m["workspace.kept_here"]()}</Reading>
        <Clock />
      </div>
    </>
  )
}
