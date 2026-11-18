import { casesOptions } from '@/features/cases/queries'
import { caseFolderOf } from '@/features/cases/folders'
import { bondsOptions } from '@/features/bonds/queries'
import { dutyAssignmentsOptions } from '@/features/duty/queries'
import { backupAlertsOptions } from '@/features/officers/queries'
import { custodyRecordsOptions } from '@/features/custody/queries'
import { custodyCompliance } from '@/features/custody/schema'
import { referralsOptions } from '@/features/referrals/queries'
import { useInstallation } from '@/features/session'
import { useQuery } from '@tanstack/react-query'

/** How many hours before a custody deadline the sidebar starts to call it due.
 * The limit itself (48 hours, or the 7 day transfer window) comes from the
 * record's timestamps and is never stored. */
const DUE_WITHIN_HOURS = 6

export type StationCounts = {
  /** Command only: stations that are waiting on a decision or have gone quiet. */
  stationsAttention: number
  inCells: number
  custodyDue: number
  openCases: number
  referralsPending: number
  /** Cases by folder: what the station is investigating, and what waits on the DPP. */
  investigating: number
  withDpp: number
  /** People out on an active police bond. */
  onBond: number
  /** Officers whose shift covers this moment. */
  onDuty: number
  /** Backup calls still open. */
  backupLive: number
  /** In the cells and already past the limit. */
  custodyOverdue: number
}

/** The figures the sidebar and status bar carry, read from the records the
 * station already holds. Nothing is fetched twice: these are the same queries
 * the pages use. */
export function useStationCounts(): StationCounts | undefined {
  // A Command holds none of these records, and does not ask for them.
  const { data: installation } = useInstallation()
  const enabled = installation?.mode === 'station'
  const { data: custody } = useQuery({ ...custodyRecordsOptions(''), enabled })
  const { data: cases } = useQuery({ ...casesOptions(''), enabled })
  const { data: referrals } = useQuery({ ...referralsOptions(''), enabled })
  const { data: bonds } = useQuery({ ...bondsOptions(''), enabled })
  const { data: duty } = useQuery({ ...dutyAssignmentsOptions(''), enabled })
  const { data: backup } = useQuery({ ...backupAlertsOptions(), enabled })
  if (!custody || !cases || !referrals) return undefined
  const now = Date.now()

  const inCustody = custody.filter((record) => record.status === 'in_custody')
  return {
    stationsAttention: 0,
    inCells: inCustody.length,
    custodyDue: inCustody.filter((record) => custodyCompliance(record).hoursRemaining <= DUE_WITHIN_HOURS).length,
    openCases: cases.filter((c) => c.status === 'open').length,
    referralsPending: referrals.filter((r) => r.status === 'pending').length,
    investigating: cases.filter((c) => caseFolderOf(c, referrals) === 'investigating').length,
    withDpp: cases.filter((c) => caseFolderOf(c, referrals) === 'dpp').length,
    onBond: (bonds ?? []).filter((b) => b.status === 'active').length,
    onDuty: (duty ?? []).filter((d) => d.shiftStart <= now && now <= d.shiftEnd).length,
    backupLive: (backup ?? []).filter((a) => a.endedAt == null).length,
    custodyOverdue: inCustody.filter((record) => custodyCompliance(record).isOverdue).length,
  }
}
