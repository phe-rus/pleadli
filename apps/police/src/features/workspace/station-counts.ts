import { useAttention } from '@/features/attention'
import { bondsOptions } from '@/features/bonds/queries'
import { dutyAssignmentsOptions } from '@/features/duty/queries'
import { backupAlertsOptions } from '@/features/officers/queries'
import { useInstallation } from '@/features/session'
import { useRules } from '@/features/rules/queries'
import { useQuery } from '@tanstack/react-query'

export type StationCounts = {
  /** Command only: stations that are waiting on a decision or have gone quiet. */
  stationsAttention: number
  inCells: number
  /** In the cells and close to the limit (see `dueSoonHours` in the attention answer). */
  custodyDue: number
  /** In the cells and already past the limit. */
  custodyOverdue: number
  /** Cases by folder: what the station is investigating, and what is with the DPP. */
  investigating: number
  withDpp: number
  /** Cases the DPP has not yet answered. */
  referralsPending: number
  /** Cases with something the station has to do (directions, witnesses to serve). */
  needingAction: number
  /** People out on an active police bond. */
  onBond: number
  /** Officers whose shift covers this moment. */
  onDuty: number
  /** Backup calls still open. */
  backupLive: number
}

/** The figures the sidebar and status bar carry. Case and custody figures are the application's one reading of the
 * station (`useAttention`); this only adds the three that belong to other places (bonds, duty, backup). */
export function useStationCounts(): StationCounts | undefined {
  const { data: installation } = useInstallation()
  const enabled = installation?.mode === 'station'
  useRules()
  const { data: attention } = useAttention()
  const { data: bonds } = useQuery({ ...bondsOptions(''), enabled })
  const { data: duty } = useQuery({ ...dutyAssignmentsOptions(''), enabled })
  const { data: backup } = useQuery({ ...backupAlertsOptions(), enabled })
  if (!attention) return undefined
  const now = Date.now()
  const c = attention.counts
  return {
    stationsAttention: 0,
    inCells: c.inCells,
    custodyDue: c.custodyDue,
    custodyOverdue: c.custodyPast,
    investigating: c.investigating,
    withDpp: c.withDpp,
    referralsPending: c.awaitingReply,
    needingAction: c.casesNeedingAction,
    onBond: (bonds ?? []).filter((b) => b.status === 'active').length,
    onDuty: (duty ?? []).filter((d) => d.shiftStart <= now && now <= d.shiftEnd).length,
    backupLive: (backup ?? []).filter((a) => a.endedAt == null).length,
  }
}
