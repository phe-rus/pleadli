import { areaMeta } from '@/data/navigationItems'
import { BinocularsIcon, Home01Icon, File02Icon, UserIcon } from '@hugeicons/core-free-icons'
import type { TabKind } from './tabs-store'

/** The icon a tab or sidebar row carries: the area's own icon, or one for the
 * kind of record it is. */
export function tabIcon({ kind, to }: { kind: TabKind; to: string }) {
  if (kind === 'overview') return Home01Icon
  if (kind === 'case') return BinocularsIcon
  if (kind === 'person') return UserIcon
  if (kind === 'chargesheet') return File02Icon
  return areaMeta(to.split('?')[0])?.icon ?? Home01Icon
}
