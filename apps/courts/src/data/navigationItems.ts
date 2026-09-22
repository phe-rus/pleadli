import {
  BookOpen01Icon,
  ChartBarLineIcon,
  CalendarCheckOut01Icon,
  DashboardBrowsingIcon,
  FolderViewIcon,
  GavelIcon,
  LegalDocument01Icon,
  Settings01Icon,
  Task01Icon,
  Files01Icon,
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the Today read model an item carries beside its name. */
export type NavCount = 'unscheduled' | 'draftOrders' | 'notClosed' | 'draftRulings'

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

export type NavSection = 'bench' | 'register' | 'reference' | 'office'

export const navSections: readonly { id: NavSection; label: string }[] = [
  { id: 'bench', label: 'Bench work' },
  { id: 'register', label: 'Register' },
  { id: 'reference', label: 'Reference' },
  { id: 'office', label: 'Office' },
]

/** The information architecture. It lists only what is built: recording, the
 * live feed and the administrator's view from the sketch in
 * docs/courts/PROPOSAL.md arrive with their own stages, and appear here then.
 * A sitting opens as its own tab from the cause list or a case. */
export const courtsNav: readonly NavItem[] = [
  { label: 'Today', icon: DashboardBrowsingIcon, to: '/', exact: true },

  { label: 'Cause list', icon: CalendarCheckOut01Icon, to: '/cause-list', count: 'notClosed', section: 'bench' },
  { label: 'Rulings and judgments', icon: LegalDocument01Icon, to: '/rulings', count: 'draftRulings', section: 'bench' },
  { label: 'Orders', icon: GavelIcon, to: '/orders', count: 'draftOrders', section: 'bench' },

  { label: 'Open cases', icon: FolderViewIcon, to: '/cases', search: { view: 'open' }, section: 'register' },
  { label: 'No next date', icon: Task01Icon, to: '/cases', search: { view: 'unscheduled' }, count: 'unscheduled', section: 'register' },
  { label: 'Concluded', icon: LegalDocument01Icon, to: '/cases', search: { view: 'concluded' }, section: 'register' },
  { label: 'All cases', icon: Files01Icon, to: '/cases', search: { view: 'all' }, section: 'register' },

  { label: 'Library', icon: BookOpen01Icon, to: '/library', section: 'reference' },

  { label: 'Returns', icon: ChartBarLineIcon, to: '/reports', section: 'office' },
  { label: 'Settings', icon: Settings01Icon, to: '/settings', section: 'office' },
] as const


/** The nav entry a location belongs to, for tab titles and icons. `/cases` has
 * several entries: the search parameter picks one. */
export function areaMeta(pathname: string, search: Record<string, unknown> = {}): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const matches = courtsNav.filter((item) => item.to === (path.startsWith('/settings/') ? '/settings' : path))
  return matches.find((item) => item.search && Object.entries(item.search).every(([k, v]) => search[k] === v)) ?? matches[0]
}

/** Whether an item is the one in view. */
export function isNavActive(item: NavItem, pathname: string, search: Record<string, unknown>) {
  if (item.exact) return pathname === item.to
  if (!(pathname === item.to || pathname.startsWith(`${item.to}/`))) return false
  if (!item.search) return true
  return Object.entries(item.search).every(([k, v]) => (search[k] ?? 'open') === v)
}
