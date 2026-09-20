import { areaMeta } from '@/data/navigationItems'
import { ArrowDataTransferHorizontalIcon, File02Icon, Home01Icon, PrisonerIcon } from '@hugeicons/core-free-icons'
import type { TabKind } from './tabs-store'

/** The icon a tab or sidebar row carries: the area's own icon, or one for the
 * kind of record it is. */
export function tabIcon({ kind, to }: { kind: TabKind; to: string }) {
  if (kind === 'today') return Home01Icon
  if (kind === 'prisoner') return PrisonerIcon
  if (kind === 'procedure') return ArrowDataTransferHorizontalIcon
  if (kind === 'document' || kind === 'report') return File02Icon
  return areaMeta(to)?.icon ?? Home01Icon
}
