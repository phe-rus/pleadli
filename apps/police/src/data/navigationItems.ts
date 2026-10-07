import * as m from '@/paraglide/messages'
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
  /** Sidebar group. An item with none is a place that exists (it opens as a
   * tab, it has a title) but is reached from another page, not the sidebar. */
  section?: NavSection
}

export type NavSection = 'main' | 'cells' | 'cases' | 'papers' | 'station' | 'command'

export const navSections: readonly { id: NavSection; label: string }[] = [
  { id: 'cells', get label() { return m["nav_sections.cells"]() } },
  { id: 'cases', get label() { return m["nav_sections.cases"]() } },
  { id: 'papers', get label() { return m["nav_sections.case_papers"]() } },
  { id: 'station', get label() { return m["nav_sections.station"]() } },
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

/** The sidebar, in the order a station works: the day and the front desk
 * first, then who is in the cells, the cases (as folders, the way Mail has
 * mailboxes), the papers a case gathers, and the station itself. Every name
 * here is also the title of the page it opens. Places with no section are
 * reached from a page (Settings holds the station profile and the logs). */
export const policeNav: readonly NavItem[] = [
  { get label() { return m["nav.today"]() }, icon: Home01Icon, to: '/', exact: true, section: 'main' },
  { get label() { return m["nav.station_diary"]() }, icon: Notebook01Icon, to: '/sd-log', section: 'main' },
  { get label() { return m["nav.incidents"]() }, icon: SirenIcon, to: '/incidents', section: 'main' },
  { get label() { return m["nav.people"]() }, icon: UserGroupIcon, to: '/search/people', section: 'main' },
  { get label() { return m["nav.vehicles"]() }, icon: Car01Icon, to: '/vehicles', section: 'main' },
  { get label() { return m["nav.documents"]() }, icon: Folder01Icon, to: '/search/files', section: 'main' },

  { get label() { return m["nav.in_custody"]() }, icon: CellsIcon, to: '/search/custody', count: 'inCells', section: 'cells' },
  { get label() { return m["nav.bonds_and_sureties"]() }, icon: AlarmClock, to: '/search/bonds', section: 'cells' },

  // Cases are drawn as folders by the sidebar itself (see caseFolders).
  { get label() { return m["nav.cases"]() }, icon: BinocularsIcon, to: '/investigations' },

  { get label() { return m["nav.statements"]() }, icon: Mic01Icon, to: '/statements', section: 'papers' },
  { get label() { return m["nav.exhibits"]() }, icon: FingerPrintCheckIcon, to: '/evidence', section: 'papers' },
  { get label() { return m["nav.charge_sheets"]() }, icon: File02Icon, to: '/legal-forms', section: 'papers' },
  { get label() { return m["nav.referrals"]() }, icon: Share08Icon, to: '/referrals', section: 'papers' },

  { get label() { return m["nav.officers"]() }, icon: ShieldKeyIcon, to: '/station/officers', section: 'station' },
  { get label() { return m["nav.duty_roster"]() }, icon: UserIcon, to: '/roster', section: 'station' },
  { get label() { return m["nav.armory"]() }, icon: GunIcon, to: '/stores/armory', section: 'station' },
  { get label() { return m["nav.impounded_assets"]() }, icon: ArchiveIcon, to: '/stores/impounded', section: 'station' },
  { get label() { return m["nav.statistics"]() }, icon: BarChartIcon, to: '/reports', section: 'station' },

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
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
