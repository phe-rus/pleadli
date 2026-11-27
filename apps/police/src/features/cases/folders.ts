import type { CaseFolder } from '@/data/navigationItems'
import type { Attention } from '@/features/attention'

/** Which folder a case sits in. The application decides this once (see `domain::attention`), from the case's status
 * and the DPP's latest answer on it; a screen only asks. A case it has not heard of yet is being investigated. */
export function caseFolderOf(caseId: string, attention: Attention | undefined): Exclude<CaseFolder, 'all'> {
  return attention?.cases.find((c) => c.caseId === caseId)?.folder ?? 'investigating'
}

export function inCaseFolder(folder: CaseFolder, caseId: string, attention: Attention | undefined) {
  return folder === 'all' || caseFolderOf(caseId, attention) === folder
}
