import {
  BalanceScaleIcon,
  ChartBarLineIcon,
  CourtHouseIcon,
  DashboardBrowsingIcon,
  FileEditIcon,
  FolderViewIcon,
  GavelIcon,
  Files01Icon,
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
} from '@hugeicons/core-free-icons'
import * as m from '@/paraglide/messages'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the workload read model an item carries beside its name. */
export type NavCount = 'intake' | 'inReview' | 'returned' | 'reopened' | 'thresholdDue' | 'draftDocuments' | 'incomingWaiting'

export type NavItem = {
  /** Display only: a message getter, so it follows the current language. */
  label: () => string
  icon: NavIcon
  to: string
  /** A slice of a shared page, held in the URL as a search parameter. */
  search?: Record<string, string>
  exact?: boolean
  count?: NavCount
  /** Sidebar group. Overview and Search have no group: they are on the ribbon. */
  section?: NavSection
}

/** Where an item sits in the sidebar: the six main places, the views of
 * Files shown under it, or the folded "More" group. */
export type NavSection = 'main' | 'files' | 'more'

/** Seven places, as the client asked: Today, Files, Board, Calendar,
 * Documents, Statistics, and Search on the ribbon. Everything a prosecutor
 * does to one file (police material, review, decisions, court) lives inside
 * the file; the office-wide lists of those stay one click away under More. */
export const dppNav: readonly NavItem[] = [
  { label: m["nav.item.today"], icon: DashboardBrowsingIcon, to: '/', exact: true, section: 'main' },
  { label: m["nav.item.cases"], icon: KanbanIcon, to: '/cases', section: 'main' },
  { label: m["nav.item.files"], icon: Folder01Icon, to: '/files', search: { view: 'all' }, section: 'more' },
  { label: m["nav.item.calendar"], icon: Calendar03Icon, to: '/calendar', section: 'main' },
  { label: m["nav.item.documents"], icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'main' },
  { label: m["nav.item.statistics"], icon: ChartBarLineIcon, to: '/reports', section: 'main' },
  { label: m["nav.item.search"], icon: Search01Icon, to: '/search' },

  { label: m["nav.item.incoming"], icon: FileImportIcon, to: '/incoming', count: 'incomingWaiting', section: 'more' },
  { label: m["nav.item.intake"], icon: FolderViewIcon, to: '/files', search: { view: 'intake' }, count: 'intake' },
  { label: m["nav.item.active_reviews"], icon: Task01Icon, to: '/files', search: { view: 'active' }, count: 'inReview' },
  { label: m["nav.item.returned"], icon: Files01Icon, to: '/files', search: { view: 'returned' }, count: 'returned' },
  { label: m["nav.item.reopened"], icon: FileEditIcon, to: '/files', search: { view: 'reopened' }, count: 'reopened' },
  { label: m["nav.item.closed"], icon: LegalDocument01Icon, to: '/files', search: { view: 'closed' } },

  { label: m["nav.item.tasks"], icon: Task01Icon, to: '/board', section: 'more' },
  { label: m["nav.item.charging_review"], icon: BalanceScaleIcon, to: '/review', count: 'thresholdDue', section: 'more' },
  { label: m["nav.item.police_material"], icon: DocumentAttachmentIcon, to: '/material', section: 'more' },
  { label: m["nav.item.decisions"], icon: GavelIcon, to: '/decisions', section: 'more' },
  { label: m["nav.item.court_matters"], icon: CourtHouseIcon, to: '/court-matters', section: 'more' },
  { label: m["nav.item.people"], icon: UserGroupIcon, to: '/people', section: 'more' },
  { label: m["nav.item.police_connections"], icon: NetworkIcon, to: '/connections', section: 'more' },
  { label: m["nav.item.capacity"], icon: Analytics01Icon, to: '/capacity', section: 'more' },
  { label: m["nav.item.settings"], icon: Settings01Icon, to: '/settings' },
] as const

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
