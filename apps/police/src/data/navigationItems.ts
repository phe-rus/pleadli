import * as m from '@/paraglide/messages'
import {
  AlarmClock,
  AlertCircleIcon,
  StethoscopeIcon,
  ArchiveIcon,
  BarChartIcon,
  BinocularsIcon,
  Building06Icon,
  Car01Icon,
  CellsIcon,
  DashboardBrowsingIcon,
  Folder01Icon,
  Home01Icon,
  File02Icon,
  FingerPrintCheckIcon,
  GunIcon,
  ListViewIcon,
  Mic01Icon,
  Notebook01Icon,
  Search01Icon,
  Settings01Icon,
  Mail01Icon,
  Share08Icon,
  ShieldKeyIcon,
  SirenIcon,
  UserGroupIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which figure from the station's records an item carries beside its name. */
export type NavCount = 'inCells' | 'custodyDue' | 'needingAction' | 'referralsPending' | 'stationsAttention'

export type NavItem = {
  label: string
  icon: NavIcon
  to: string
  exact?: boolean
  count?: NavCount
  /** Sidebar group. An item with none is a place that exists (it opens as a
   * tab, it has a title) but is reached from another page, not the sidebar. */
  section?: NavSection
  /** What its workspace tab is called when that should differ from the sidebar name. */
  title?: string
  /** Other places that belong to this item: it stays lit while one is open. */
  also?: readonly string[]
}

export type NavSection = 'main' | 'cases' | 'papers' | 'station' | 'command'

export const navSections: readonly { id: NavSection; label?: string }[] = [
  { id: 'cases', get label() { return m["nav_sections.cases"]() } },
  // The station is one row at the foot, so it needs no heading of its own.
  { id: 'station' },
]

/** What a Command shows. It holds no case, person or custody records, so none
 * of those areas are here: only the stations under it and its own officers. */
export const commandSections: readonly { id: NavSection; label: string }[] = [{ id: 'command', get label() { return m["nav_sections.command"]() } }]

export const commandNav: readonly NavItem[] = [
  { get label() { return m["nav.today"]() }, icon: Home01Icon, to: '/', exact: true, section: 'main' },
  { get label() { return m["nav.stations"]() }, icon: Building06Icon, to: '/stations', count: 'stationsAttention', section: 'command' },
  { get label() { return m["nav.officers"]() }, icon: ShieldKeyIcon, to: '/station/officers', section: 'command' },
  { get label() { return m["nav.command_profile"]() }, icon: Building06Icon, to: '/station/profile' },
  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings', exact: true },
] as const

/** The sidebar, in the order a station works: the day, the front desk,
 * people, the cells and documents first, then the cases (as folders, the way
 * Mail has mailboxes), then the station itself. Six places, not twenty: a place
 * with several routes (front desk, people, cells, station) is one row with a
 * tab bar (see components/place-tabs.tsx), so every old link still lands.
 * Items with no section are those other routes, the papers a case gathers
 * (opened from the case) and places reached from a page (Settings holds the
 * station profile and the logs); they exist so an open one has a titled tab. */
export const policeNav: readonly NavItem[] = [
  { get label() { return m["nav.today"]() }, icon: Home01Icon, to: '/', exact: true, section: 'main' },
  { get label() { return m["nav.front_desk"]() }, icon: Notebook01Icon, to: '/sd-log', also: ['/incidents'], section: 'main' },
  // Incidents are the front desk's second tab: a place (titled tab, icon), not a sidebar row.
  { get label() { return m["nav.front_desk"]() }, icon: SirenIcon, to: '/incidents' },
  { get label() { return m["nav.people"]() }, icon: UserGroupIcon, to: '/search/people', also: ['/vehicles'], section: 'main' },
  // Vehicles are the second tab of People: a place (titled tab, icon), not a sidebar row.
  { get label() { return m["nav.people"]() }, icon: Car01Icon, to: '/vehicles' },
  { get label() { return m["nav_sections.cells"]() }, icon: CellsIcon, to: '/search/custody', also: ['/search/bonds'], count: 'inCells', section: 'main' },
  { get label() { return m["nav.documents"]() }, icon: Folder01Icon, to: '/search/files', section: 'main' },

  // Police bonds are the second tab of Cells: a place (titled tab, icon), not a sidebar row.
  { get label() { return m["nav.bonds_and_sureties"]() }, icon: AlarmClock, to: '/search/bonds' },

  // Cases are drawn as folders by the sidebar itself (see caseFolders).
  { get label() { return m["nav.cases"]() }, icon: BinocularsIcon, to: '/investigations' },

  { get label() { return m["nav.statements"]() }, icon: Mic01Icon, to: '/statements' },
  { get label() { return m["nav.exhibits"]() }, icon: FingerPrintCheckIcon, to: '/evidence' },
  { get label() { return m["nav.charge_sheets"]() }, icon: File02Icon, to: '/legal-forms' },
  { get label() { return m["nav.referrals"]() }, icon: Share08Icon, to: '/referrals' },
  { get label() { return m["nav.medical"]() }, icon: StethoscopeIcon, to: '/medical' },

  // The station is one place with six tabs (see features/station-desk). Its other
  // routes keep a hidden entry each, so an open one has a titled tab and an icon.
  {
    get label() { return m["nav_sections.station"]() },
    get title() { return m["nav.officers"]() },
    icon: Building06Icon,
    to: '/station/officers',
    also: ['/roster', '/stores', '/reports', '/exchange', '/postbox'],
    section: 'station',
  },
  { get label() { return m["nav.duty_roster"]() }, icon: UserIcon, to: '/roster' },
  { get label() { return m["nav.armory"]() }, icon: GunIcon, to: '/stores/armory' },
  { get label() { return m["nav.impounded_assets"]() }, icon: ArchiveIcon, to: '/stores/impounded' },
  { get label() { return m["nav.statistics"]() }, icon: BarChartIcon, to: '/reports' },
  { get label() { return m["nav.postbox"]() }, icon: Mail01Icon, to: '/postbox' },
  { get label() { return m["nav.exchange"]() }, icon: Mail01Icon, to: '/exchange' },

  { get label() { return m["nav.search"]() }, icon: Search01Icon, to: '/search', exact: true },
  { get label() { return m["nav.station_profile"]() }, icon: Building06Icon, to: '/station/profile' },
  { get label() { return m["nav.backup_requests"]() }, icon: AlertCircleIcon, to: '/logs/backup-alerts' },
  { get label() { return m["nav.remote_access"]() }, icon: ListViewIcon, to: '/logs/remote-access' },
  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings', exact: true },
  { get label() { return m["nav.stores_and_armory"]() }, icon: ArchiveIcon, to: '/stores', exact: true },
  { get label() { return m["nav.station_administration"]() }, icon: Building06Icon, to: '/station', exact: true },
  { get label() { return m["nav.logs"]() }, icon: ListViewIcon, to: '/logs', exact: true },
] as const

/** The case folders: one register of cases, seen by where each case stands.
 * Derived from the case's status and its referrals, never stored. */
export type CaseFolder = 'investigating' | 'dpp' | 'closed' | 'all'
export const caseFolders: readonly { id: CaseFolder; label: string }[] = [
  { id: 'investigating', get label() { return m["cases.folder.investigating"]() } },
  { id: 'dpp', get label() { return m["cases.folder.dpp"]() } },
  { id: 'closed', get label() { return m["cases.folder.closed"]() } },
  { id: 'all', get label() { return m["cases.folder.all"]() } },
]
export const isCaseFolder = (value: unknown): value is CaseFolder => caseFolders.some((f) => f.id === value)

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
  return [item.to, ...(item.also ?? [])].some((to) => pathname === to || pathname.startsWith(`${to}/`))
}
