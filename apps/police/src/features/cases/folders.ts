import type { CaseFolder } from '@/data/navigationItems'
import type { Referral } from '@/features/referrals/schema'
import type { Case } from './schema'

/** Which folder a case sits in, read from its status and its referrals. A
 * case waiting on the DPP is still open, but the work on it is no longer the
 * station's to move, so it has a folder of its own. */
export function caseFolderOf(item: Case, referrals: readonly Referral[]): Exclude<CaseFolder, 'all'> {
  if (item.status === 'closed') return 'closed'
  const waiting = referrals.some((r) => r.caseId === item.id && r.status === 'pending' && r.destinationType === 'dpp')
  return waiting ? 'dpp' : 'investigating'
}

export function inCaseFolder(folder: CaseFolder, item: Case, referrals: readonly Referral[]) {
  return folder === 'all' || caseFolderOf(item, referrals) === folder
}
