import { casesOptions } from '@/features/cases/queries'
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
  if (!custody || !cases || !referrals) return undefined

  const inCustody = custody.filter((record) => record.status === 'in_custody')
  return {
    stationsAttention: 0,
    inCells: inCustody.length,
    custodyDue: inCustody.filter((record) => custodyCompliance(record).hoursRemaining <= DUE_WITHIN_HOURS).length,
    openCases: cases.filter((c) => c.status === 'open').length,
    referralsPending: referrals.filter((r) => r.status === 'pending').length,
  }
}
