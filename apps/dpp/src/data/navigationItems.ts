import {
  BalanceScaleIcon,
  ChartBarLineIcon,
  CourtHouseIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  LegalDocument01Icon,
  Search01Icon,
  Settings01Icon,
  Mail01Icon,
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
  Building03Icon,
} from '@hugeicons/core-free-icons'
import { fileViews } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the workload read model an item carries beside its name. */
export type NavCount = 'thresholdDue' | 'draftDocuments' | 'incomingWaiting' | 'needsYou'

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
export type NavSection = 'main' | 'work'

/**
 * The sidebar is six places: Today, Inbox, Files, Diary, Registry, and Settings
 * (in the footer). Search and Assist are always present and are not places.
 * Everything that used to be its own place is a step inside a file or part of
 * the Registry, and keeps its address so no link or tab breaks (spec 0001).
 */
export const dppNav: readonly NavItem[] = [
  { label: m["nav.item.today"], icon: DashboardBrowsingIcon, to: '/', exact: true, section: 'main' },

  { label: m["nav.item.inbox"], icon: FileImportIcon, to: '/incoming', count: 'incomingWaiting', section: 'work' },
  { label: m["nav.item.files"], icon: Folder01Icon, to: '/files', count: 'needsYou', section: 'work' },
  { label: m["nav.item.calendar"], icon: Calendar03Icon, to: '/calendar', section: 'work' },
  { label: m["nav.item.registry"], icon: Building03Icon, to: '/registry', section: 'work' },

  // Each folder of files, reached from the tabs on Files and by search.
  ...fileViews.map((v) => ({ label: () => v.label, icon: Folder01Icon, to: '/files', search: { view: v.id } })),

  // Places that are now inside the Registry or inside a file. Not listed in
  // the sidebar; still reachable from the Registry, by search, and by link.
  { label: m["nav.item.people"], icon: UserGroupIcon, to: '/people' },
  { label: m["nav.item.police_stations"], icon: NetworkIcon, to: '/connections' },
  { label: m["nav.item.courts"], icon: NetworkIcon, to: '/courts' },
  { label: m["nav.item.workload"], icon: Analytics01Icon, to: '/capacity' },
  { label: m["nav.item.statistics"], icon: ChartBarLineIcon, to: '/reports' },
  { label: m["nav.item.postbox"], icon: Mail01Icon, to: '/postbox' },
  { label: m["nav.item.recent"], icon: Clock01Icon, to: '/recent' },
  { label: m["nav.item.tasks"], icon: Task01Icon, to: '/board' },
  { label: m["nav.item.documents"], icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments' },
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
