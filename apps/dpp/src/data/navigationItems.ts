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
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the workload read model an item carries beside its name. */
export type NavCount = 'intake' | 'inReview' | 'returned' | 'reopened' | 'thresholdDue' | 'draftDocuments' | 'incomingWaiting'

export type NavItem = {
  label: string
  icon: NavIcon
  to: string
  /** A slice of a shared page, held in the URL as a search parameter. */
  search?: Record<string, string>
  exact?: boolean
  count?: NavCount
  /** Sidebar group. Overview and Search have no group: they are on the ribbon. */
  section?: NavSection
}

export type NavSection = 'files' | 'work' | 'office'

export const navSections: readonly { id: NavSection; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'work', label: 'Prosecution work' },
  { id: 'office', label: 'Office' },
]

/** The information architecture. The line it draws is between finding a file
 * (the Files group, one page with a view per slice of the register) and doing
 * prosecution work (review, material, decisions, court, documents). */
export const dppNav: readonly NavItem[] = [
  { label: 'Overview', icon: DashboardBrowsingIcon, to: '/', exact: true },
  { label: 'Search', icon: Search01Icon, to: '/search' },

  { label: 'Incoming', icon: FileImportIcon, to: '/incoming', count: 'incomingWaiting', section: 'files' },
  { label: 'Intake', icon: FolderViewIcon, to: '/files', search: { view: 'intake' }, count: 'intake', section: 'files' },
  { label: 'Active reviews', icon: Task01Icon, to: '/files', search: { view: 'active' }, count: 'inReview', section: 'files' },
  { label: 'Returned to Police', icon: Files01Icon, to: '/files', search: { view: 'returned' }, count: 'returned', section: 'files' },
  { label: 'Reopened reviews', icon: FileEditIcon, to: '/files', search: { view: 'reopened' }, count: 'reopened', section: 'files' },
  { label: 'Closed', icon: LegalDocument01Icon, to: '/files', search: { view: 'closed' }, section: 'files' },

  { label: 'Charging review', icon: BalanceScaleIcon, to: '/review', count: 'thresholdDue', section: 'work' },
  { label: 'Police material', icon: DocumentAttachmentIcon, to: '/material', section: 'work' },
  { label: 'Decisions', icon: GavelIcon, to: '/decisions', section: 'work' },
  { label: 'Court matters', icon: CourtHouseIcon, to: '/court-matters', section: 'work' },
  { label: 'Documents', icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'work' },

  { label: 'People', icon: UserGroupIcon, to: '/people', section: 'office' },
  { label: 'Police connections', icon: NetworkIcon, to: '/connections', section: 'office' },
  { label: 'Reports', icon: ChartBarLineIcon, to: '/reports', section: 'office' },
  { label: 'Capacity and workload', icon: Analytics01Icon, to: '/capacity', section: 'office' },
  { label: 'Settings', icon: Settings01Icon, to: '/settings', section: 'office' },
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
