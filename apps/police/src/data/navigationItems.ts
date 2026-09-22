import {
  AlarmClock,
  AlertCircleIcon,
  ArchiveIcon,
  BarChartIcon,
  BinocularsIcon,
  Building06Icon,
  Car01Icon,
  CellsIcon,
  DashboardBrowsingIcon,
  File02Icon,
  FingerPrintCheckIcon,
  FolderViewIcon,
  GunIcon,
  ListViewIcon,
  Mic01Icon,
  Notebook01Icon,
  Search01Icon,
  Settings01Icon,
  Share08Icon,
  ShieldKeyIcon,
  SirenIcon,
  UserGroupIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which figure from the station's records an item carries beside its name. */
export type NavCount = 'inCells' | 'custodyDue' | 'openCases' | 'referralsPending' | 'stationsAttention'

export type NavItem = {
  label: string
  icon: NavIcon
  to: string
  exact?: boolean
  count?: NavCount
  /** Sidebar group. Overview and Search have no group: they are on the ribbon. */
  section?: NavSection
}

export type NavSection = 'desk' | 'cells' | 'investigations' | 'station' | 'office' | 'command'

export const navSections: readonly { id: NavSection; label: string }[] = [
  { id: 'desk', label: 'Front desk' },
  { id: 'cells', label: 'Cells and custody' },
  { id: 'investigations', label: 'Investigations' },
  { id: 'station', label: 'Station' },
  { id: 'office', label: 'Administration' },
]

/** What a Command shows. It holds no case, person or custody records, so none
 * of those areas are here: only the stations under it and its own officers. */
export const commandSections: readonly { id: NavSection; label: string }[] = [{ id: 'command', label: 'Command' }]

export const commandNav: readonly NavItem[] = [
  { label: 'Overview', icon: DashboardBrowsingIcon, to: '/', exact: true },
  { label: 'Stations', icon: Building06Icon, to: '/stations', count: 'stationsAttention', section: 'command' },
  { label: 'Officers', icon: ShieldKeyIcon, to: '/station/officers', section: 'command' },
  { label: 'Command profile', icon: Building06Icon, to: '/station/profile', section: 'command' },
  { label: 'Settings', icon: Settings01Icon, to: '/settings', exact: true },
] as const

/** The information architecture, in the order work happens at a station rather
 * than the order of the paper registers: what arrives at the desk, who is in
 * the cells, what is being investigated, what the station holds and who works
 * in it, then administration. The routes are unchanged; only the grouping is
 * new. */
export const policeNav: readonly NavItem[] = [
  { label: 'Overview', icon: DashboardBrowsingIcon, to: '/', exact: true },
  { label: 'Search', icon: Search01Icon, to: '/search', exact: true },
  { label: 'Case files', icon: FolderViewIcon, to: '/search/files' },

  { label: 'Station diary', icon: Notebook01Icon, to: '/sd-log', section: 'desk' },
  { label: 'Incidents', icon: SirenIcon, to: '/incidents', section: 'desk' },
  { label: 'Case intake', icon: FolderViewIcon, to: '/intake', section: 'desk' },

  { label: 'Custody', icon: CellsIcon, to: '/search/custody', count: 'inCells', section: 'cells' },
  { label: 'Bonds and sureties', icon: AlarmClock, to: '/search/bonds', section: 'cells' },

  { label: 'Investigations', icon: BinocularsIcon, to: '/investigations', count: 'openCases', section: 'investigations' },
  { label: 'Statements', icon: Mic01Icon, to: '/statements', section: 'investigations' },
  { label: 'Evidence and exhibits', icon: FingerPrintCheckIcon, to: '/evidence', section: 'investigations' },
  { label: 'Charge sheets and forms', icon: File02Icon, to: '/legal-forms', section: 'investigations' },
  { label: 'Referrals', icon: Share08Icon, to: '/referrals', count: 'referralsPending', section: 'investigations' },

  { label: 'Duty roster', icon: UserIcon, to: '/roster', section: 'station' },
  { label: 'People', icon: UserGroupIcon, to: '/search/people', section: 'station' },
  { label: 'Vehicles', icon: Car01Icon, to: '/vehicles', section: 'station' },
  { label: 'Armory', icon: GunIcon, to: '/stores/armory', section: 'station' },
  { label: 'Impounded assets', icon: ArchiveIcon, to: '/stores/impounded', section: 'station' },

  { label: 'Reports', icon: BarChartIcon, to: '/reports', section: 'office' },
  { label: 'Station profile', icon: Building06Icon, to: '/station/profile', section: 'office' },
  { label: 'Officers', icon: ShieldKeyIcon, to: '/station/officers', section: 'office' },
  { label: 'Backup requests', icon: AlertCircleIcon, to: '/logs/backup-alerts', section: 'office' },
  { label: 'Remote access', icon: ListViewIcon, to: '/logs/remote-access', section: 'office' },

  { label: 'Settings', icon: Settings01Icon, to: '/settings', exact: true },
  { label: 'Stores and armory', icon: ArchiveIcon, to: '/stores', exact: true },
  { label: 'Station administration', icon: Building06Icon, to: '/station', exact: true },
  { label: 'Logs', icon: ListViewIcon, to: '/logs', exact: true },
] as const

/** The nav entry a location belongs to, for tab titles and icons. */
export function areaMeta(pathname: string): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  return policeNav.find((item) => item.to === path) ?? commandNav.find((item) => item.to === path)
}

export const navFor = (mode: 'station' | 'command' | null | undefined) => (mode === 'command' ? commandNav : policeNav)
export const sectionsFor = (mode: 'station' | 'command' | null | undefined) => (mode === 'command' ? commandSections : navSections)

/** Whether an item is the one in view. */
export function isNavActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
