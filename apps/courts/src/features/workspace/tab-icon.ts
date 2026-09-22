import { areaMeta } from '@/data/navigationItems'
import { BookOpen01Icon, CalendarCheckOut01Icon, DashboardBrowsingIcon, FolderViewIcon, GavelIcon, LegalDocument01Icon } from '@hugeicons/core-free-icons'
import type { TabKind } from './tabs-store'

/** The icon a tab or sidebar row carries: the area's own icon, or one for the
 * kind of record it is. */
export function tabIcon({ kind, to }: { kind: TabKind; to: string }) {
  if (kind === 'overview') return DashboardBrowsingIcon
  if (kind === 'case') return FolderViewIcon
  if (kind === 'order') return GavelIcon
  if (kind === 'sitting') return CalendarCheckOut01Icon
  if (kind === 'ruling') return LegalDocument01Icon
  if (kind === 'reference') return BookOpen01Icon
  const [pathname, query = ''] = to.split('?')
  return areaMeta(pathname, Object.fromEntries(new URLSearchParams(query)))?.icon ?? DashboardBrowsingIcon
}
