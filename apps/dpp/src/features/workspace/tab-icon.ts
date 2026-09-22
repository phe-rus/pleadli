import { areaMeta } from '@/data/navigationItems'
import { DashboardBrowsingIcon, File02Icon, FolderViewIcon } from '@hugeicons/core-free-icons'
import type { TabKind } from './tabs-store'

/** The icon a tab or sidebar row carries: the area's own icon, or one for the
 * kind of record it is. */
export function tabIcon({ kind, to }: { kind: TabKind; to: string }) {
  if (kind === 'overview') return DashboardBrowsingIcon
  if (kind === 'file') return FolderViewIcon
  if (kind === 'document') return File02Icon
  const [pathname, query = ''] = to.split('?')
  return areaMeta(pathname, Object.fromEntries(new URLSearchParams(query)))?.icon ?? DashboardBrowsingIcon
}
