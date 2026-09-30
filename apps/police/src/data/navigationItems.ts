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
  { id: 'desk', get label() { return m["nav_sections.front_desk"]() } },
  { id: 'cells', get label() { return m["nav_sections.cells_and_custody"]() } },
  { id: 'investigations', get label() { return m["nav_sections.investigations"]() } },
  { id: 'station', get label() { return m["nav_sections.station"]() } },
  { id: 'office', get label() { return m["nav_sections.administration"]() } },
]

/** What a Command shows. It holds no case, person or custody records, so none
 * of those areas are here: only the stations under it and its own officers. */
export const commandSections: readonly { id: NavSection; label: string }[] = [{ id: 'command', get label() { return m["nav_sections.command"]() } }]

export const commandNav: readonly NavItem[] = [
  { get label() { return m["nav.overview"]() }, icon: DashboardBrowsingIcon, to: '/', exact: true },
  { get label() { return m["nav.stations"]() }, icon: Building06Icon, to: '/stations', count: 'stationsAttention', section: 'command' },
  { get label() { return m["nav.officers"]() }, icon: ShieldKeyIcon, to: '/station/officers', section: 'command' },
  { get label() { return m["nav.command_profile"]() }, icon: Building06Icon, to: '/station/profile', section: 'command' },
  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings', exact: true },
] as const

/** The information architecture, in the order work happens at a station rather
 * than the order of the paper registers: what arrives at the desk, who is in
 * the cells, what is being investigated, what the station holds and who works
 * in it, then administration. The routes are unchanged; only the grouping is
 * new. */
export const policeNav: readonly NavItem[] = [
  { get label() { return m["nav.overview"]() }, icon: DashboardBrowsingIcon, to: '/', exact: true },
  { get label() { return m["nav.search"]() }, icon: Search01Icon, to: '/search', exact: true },
  { get label() { return m["nav.case_files"]() }, icon: FolderViewIcon, to: '/search/files' },

  { get label() { return m["nav.station_diary"]() }, icon: Notebook01Icon, to: '/sd-log', section: 'desk' },
  { get label() { return m["nav.incidents"]() }, icon: SirenIcon, to: '/incidents', section: 'desk' },
  { get label() { return m["nav.case_intake"]() }, icon: FolderViewIcon, to: '/intake', section: 'desk' },

  { get label() { return m["nav.custody"]() }, icon: CellsIcon, to: '/search/custody', count: 'inCells', section: 'cells' },
  { get label() { return m["nav.bonds_and_sureties"]() }, icon: AlarmClock, to: '/search/bonds', section: 'cells' },

  { get label() { return m["nav.investigations"]() }, icon: BinocularsIcon, to: '/investigations', count: 'openCases', section: 'investigations' },
  { get label() { return m["nav.statements"]() }, icon: Mic01Icon, to: '/statements', section: 'investigations' },
  { get label() { return m["nav.evidence_and_exhibits"]() }, icon: FingerPrintCheckIcon, to: '/evidence', section: 'investigations' },
  { get label() { return m["nav.charge_sheets_and_forms"]() }, icon: File02Icon, to: '/legal-forms', section: 'investigations' },
  { get label() { return m["nav.referrals"]() }, icon: Share08Icon, to: '/referrals', count: 'referralsPending', section: 'investigations' },

  { get label() { return m["nav.duty_roster"]() }, icon: UserIcon, to: '/roster', section: 'station' },
  { get label() { return m["nav.people"]() }, icon: UserGroupIcon, to: '/search/people', section: 'station' },
  { get label() { return m["nav.vehicles"]() }, icon: Car01Icon, to: '/vehicles', section: 'station' },
  { get label() { return m["nav.armory"]() }, icon: GunIcon, to: '/stores/armory', section: 'station' },
  { get label() { return m["nav.impounded_assets"]() }, icon: ArchiveIcon, to: '/stores/impounded', section: 'station' },

  { get label() { return m["nav.reports"]() }, icon: BarChartIcon, to: '/reports', section: 'office' },
  { get label() { return m["nav.station_profile"]() }, icon: Building06Icon, to: '/station/profile', section: 'office' },
  { get label() { return m["nav.officers"]() }, icon: ShieldKeyIcon, to: '/station/officers', section: 'office' },
  { get label() { return m["nav.backup_requests"]() }, icon: AlertCircleIcon, to: '/logs/backup-alerts', section: 'office' },
  { get label() { return m["nav.remote_access"]() }, icon: ListViewIcon, to: '/logs/remote-access', section: 'office' },

  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings', exact: true },
  { get label() { return m["nav.stores_and_armory"]() }, icon: ArchiveIcon, to: '/stores', exact: true },
  { get label() { return m["nav.station_administration"]() }, icon: Building06Icon, to: '/station', exact: true },
  { get label() { return m["nav.logs"]() }, icon: ListViewIcon, to: '/logs', exact: true },
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
