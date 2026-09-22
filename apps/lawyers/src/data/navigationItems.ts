import {
  Analytics01Icon,
  CalendarCheckOut01Icon,
  ChartBarLineIcon,
  DashboardBrowsingIcon,
  FolderViewIcon,
  Files01Icon,
  LegalDocument01Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the Today read model an item carries beside its name. */
export type NavCount = 'notClosed' | 'noHearing' | 'tasksOverdue' | 'draftDocuments'

export type NavItem = {
  label: string
  icon: NavIcon
  to: string
  /** A slice of a shared page, held in the URL as a search parameter. */
  search?: Record<string, string>
  exact?: boolean
  count?: NavCount
  /** Sidebar group. Today has none: it is on the ribbon. */
  section?: NavSection
}

export type NavSection = 'practice' | 'matters' | 'office'

export const navSections: readonly { id: NavSection; label: string }[] = [
  { id: 'practice', label: 'Practice' },
  { id: 'matters', label: 'Matters' },
  { id: 'office', label: 'Office' },
]

/** The information architecture. It lists only what is built. Filings to the
 * court, hearing notices and orders from it, and the connection to Courts and DPP
 * are not here until they exist. */
export const lawyersNav: readonly NavItem[] = [
  { label: 'Today', icon: DashboardBrowsingIcon, to: '/', exact: true },

  { label: 'Diary', icon: CalendarCheckOut01Icon, to: '/diary', count: 'notClosed', section: 'practice' },
  { label: 'Tasks', icon: Task01Icon, to: '/tasks', count: 'tasksOverdue', section: 'practice' },
  { label: 'Documents', icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'practice' },

  { label: 'Open matters', icon: FolderViewIcon, to: '/matters', search: { view: 'open' }, section: 'matters' },
  { label: 'No hearing listed', icon: Analytics01Icon, to: '/matters', search: { view: 'no_hearing' }, count: 'noHearing', section: 'matters' },
  { label: 'Closed', icon: Files01Icon, to: '/matters', search: { view: 'closed' }, section: 'matters' },
  { label: 'All matters', icon: Files01Icon, to: '/matters', search: { view: 'all' }, section: 'matters' },

  { label: 'Clients', icon: UserGroupIcon, to: '/clients', section: 'office' },
  { label: 'Time', icon: ChartBarLineIcon, to: '/time', section: 'office' },
  { label: 'Settings', icon: Settings01Icon, to: '/settings', section: 'office' },
] as const

/** The nav entry a location belongs to, for tab titles and icons. `/matters` has
 * several entries: the search parameter picks one. */
export function areaMeta(pathname: string, search: Record<string, unknown> = {}): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const matches = lawyersNav.filter((item) => item.to === (path.startsWith('/settings/') ? '/settings' : path))
  return matches.find((item) => item.search && Object.entries(item.search).every(([k, v]) => search[k] === v)) ?? matches[0]
}

/** Whether an item is the one in view. */
export function isNavActive(item: NavItem, pathname: string, search: Record<string, unknown>) {
  if (item.exact) return pathname === item.to
  if (!(pathname === item.to || pathname.startsWith(`${item.to}/`))) return false
  if (!item.search) return true
  return Object.entries(item.search).every(([k, v]) => (search[k] ?? 'open') === v)
}
