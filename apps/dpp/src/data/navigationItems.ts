import {
  BalanceScaleIcon,
  ChartBarLineIcon,
  CourtHouseIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  LegalDocument01Icon,
  Search01Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
  Analytics01Icon,
  DocumentAttachmentIcon,
  FileImportIcon,
  NetworkIcon,
  Folder01Icon,
  KanbanIcon,
  Calendar03Icon,
  Clock01Icon,
} from '@hugeicons/core-free-icons'
import { fileViews } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the workload read model an item carries beside its name. */
export type NavCount = 'thresholdDue' | 'draftDocuments' | 'incomingWaiting'

export type NavItem = {
  /** Display only: a message getter, so it follows the current language. */
  label: () => string
  icon: NavIcon
  to: string
  /** A slice of a shared page, held in the URL as a search parameter. */
  search?: Record<string, string>
  exact?: boolean
  count?: NavCount
  /** Sidebar group. Without one, the place is still reachable (search, links)
   * and named on its tab, but not listed. */
  section?: NavSection
}

/** Where an item sits in the sidebar: the day's work at the top, the inbox
 * above the file folders, and the office below them. */
export type NavSection = 'main' | 'inbox' | 'office'

/**
 * The sidebar, organised the way the work is: what is on today, then the
 * files in folders by the stage they are at (the same stages a file's own
 * steps show, so there is one way of seeing a file everywhere), then the
 * office. Each thing has one place. The office-wide registers that used to be
 * separate places (decisions, police material, court matters, charging review)
 * are reached from inside a file or by search, and keep their addresses.
 */
export const dppNav: readonly NavItem[] = [
  { label: m["nav.item.today"], icon: DashboardBrowsingIcon, to: '/', exact: true, section: 'main' },
  { label: m["nav.item.recent"], icon: Clock01Icon, to: '/recent', section: 'main' },
  { label: m["nav.item.tasks"], icon: Task01Icon, to: '/board', section: 'main' },
  { label: m["nav.item.calendar"], icon: Calendar03Icon, to: '/calendar', section: 'main' },
  { label: m["nav.item.documents"], icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'main' },

  { label: m["nav.item.inbox"], icon: FileImportIcon, to: '/incoming', count: 'incomingWaiting', section: 'inbox' },
  ...fileViews.map((v) => ({ label: () => v.label, icon: Folder01Icon, to: '/files', search: { view: v.id } })),

  { label: m["nav.item.people"], icon: UserGroupIcon, to: '/people', section: 'office' },
  { label: m["nav.item.police_stations"], icon: NetworkIcon, to: '/connections', section: 'office' },
  { label: m["nav.item.workload"], icon: Analytics01Icon, to: '/capacity', section: 'office' },
  { label: m["nav.item.statistics"], icon: ChartBarLineIcon, to: '/reports', section: 'office' },

  { label: m["nav.item.cases"], icon: KanbanIcon, to: '/cases' },
  { label: m["nav.item.search"], icon: Search01Icon, to: '/search' },
  { label: m["nav.item.charging_review"], icon: BalanceScaleIcon, to: '/review', count: 'thresholdDue' },
  { label: m["nav.item.police_material"], icon: DocumentAttachmentIcon, to: '/material' },
  { label: m["nav.item.decisions"], icon: GavelIcon, to: '/decisions' },
  { label: m["nav.item.court_matters"], icon: CourtHouseIcon, to: '/court-matters' },
  { label: m["nav.item.settings"], icon: Settings01Icon, to: '/settings' },
]

/** The nav entry a location belongs to, for tab titles and icons. `/files`
 * and `/material` have several entries: the search parameter picks one. */
export function areaMeta(pathname: string, search: Record<string, unknown> = {}): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  // Every settings section is the Settings area.
  const matches = dppNav.filter((item) => item.to === (path.startsWith('/settings/') ? '/settings' : path))
  return matches.find((item) => item.search && Object.entries(item.search).every(([k, v]) => search[k] === v)) ?? matches[0]
}

/** Whether an item is the one in view. */
export function isNavActive(item: NavItem, pathname: string, search: Record<string, unknown>) {
  if (item.exact) return pathname === item.to
  if (!(pathname === item.to || pathname.startsWith(`${item.to}/`))) return false
  if (!item.search) return true
  return Object.entries(item.search).every(([k, v]) => search[k] === v)
}
