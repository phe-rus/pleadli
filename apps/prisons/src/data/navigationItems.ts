import {
  ArrowDataTransferHorizontalIcon,
  FileEditIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  HandshakeIcon,
  Message01Icon,
  NetworkIcon,
  Notification01Icon,
  PrisonerIcon,
  Search01Icon,
  SettingsIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { m } from '@/paraglide/messages'

// Type definition supplied by the design system
export type SidebarNavItem = {
  to?: string | undefined;
  label: string;
  icon: any | undefined; // Maps to IconSvgElement type
  exact?: boolean;
  children?: readonly SidebarNavItem[];
  /** Facility-only, not Head Office (spec: docs/specs/prisons/0001-head-
 * office-peer-sync-network/index.md: "Head Office is purely an aggregator
 * with no prisoners of its own"). Prisoners, Visits, Court Production &
 * Remand, and Requests are about a facility's own operational records,
 * which a Head Office installation never has any of. Filtered by role in
 * `sidebar-provider.tsx`, not by which routes merely exist. */
  facilityOnly?: boolean;
  /** Head Office only, not a facility (same spec as above). Facility
   * management — pairing, verification, revocation — only ever happens
   * from Head Office; a facility installation has no other facility to
   * manage. */
  hqOnly?: boolean;
  /** Shown only to an officer holding at least one of these permissions,
   * matching what the node requires for the route (`api/prisons.rs`). A
   * courtesy: the node still refuses the call regardless. */
  requires?: readonly string[];
  /** Sidebar group heading (docs/prisons/product/08-application-
   * structure 1.1): Facility navigation is organised by Work / People /
   * Order / Institution; Head Office by The network / Institutional work
   * / Administration. Only areas that exist get a group. */
  section?: string;
}

/** Facility navigation follows the work, Head Office navigation follows
 * institutional responsibilities (docs/prisons/product-map/08). Only areas
 * that exist are listed: Today, Movements, Legal and Population are built
 * (phase 2); Care and contact groups the visits and requests routes that
 * pre-date it. Filtering by role happens in `sidebar-provider.tsx`. */
export const prisonsNav: readonly SidebarNavItem[] = [
  {
    icon: Search01Icon,
    get label() { return m.nav_search() },
    to: '/search',
    requires: ['prisoner.read', 'hq.locate'],
  },
  {
    icon: DashboardBrowsingIcon,
    get label() { return m.nav_today() },
    to: '/',
    exact: true,
    facilityOnly: true,
    requires: ['prisoner.read'],
    get section() { return m.nav_work() },
  },
  {
    icon: DashboardBrowsingIcon,
    get label() { return m.nav_overview() },
    to: '/',
    exact: true,
    hqOnly: true,
    get section() { return m.nav_the_network() },
  },
  {
    icon: Notification01Icon,
    get label() { return m.nav_inbox() },
    to: '/inbox',
    get section() { return m.nav_work() },
  },
  {
    icon: ArrowDataTransferHorizontalIcon,
    get label() { return m.nav_movements() },
    to: '/movements',
    facilityOnly: true,
    requires: ['prisoner.read'],
    get section() { return m.nav_work() },
  },
  {
    icon: GavelIcon,
    get label() { return m.nav_legal() },
    to: '/legal',
    facilityOnly: true,
    requires: ['prisoner.read'],
    get section() { return m.nav_work() },
  },
  {
    icon: PrisonerIcon,
    get label() { return m.nav_population() },
    to: '/prisoners',
    facilityOnly: true,
    requires: ['prisoner.read'],
    get section() { return m.nav_people() },
  },
  {
    icon: HandshakeIcon,
    get label() { return m.nav_care_and_contact() },
    facilityOnly: true,
    get section() { return m.nav_people() },
    children: [
      { icon: HandshakeIcon, get label() { return m.nav_visits() }, to: '/visits', requires: ['prisoner.read'] },
      { icon: Message01Icon, get label() { return m.nav_requests_and_grievances() }, to: '/requests', requires: ['prisoner.read'] },
    ],
  },
  {
    icon: FileEditIcon,
    get label() { return m.nav_reports() },
    to: '/reports',
    requires: ['report.read', 'hq.reports'],
    get section() { return m.nav_institution() },
  },
  {
    icon: NetworkIcon,
    get label() { return m.nav_facilities() },
    to: '/facilities',
    hqOnly: true,
    // Without this the route guard let any signed-in role in, and the roster
    // call then failed with a 403 (hq.estate.read) instead of a redirect.
    requires: ['hq.estate.read'],
    get section() { return m.nav_administration() },
  },
  {
    icon: UserGroupIcon,
    get label() { return m.nav_officers() },
    to: '/officers',
    get section() { return m.nav_institution() },
  },
  {
    icon: SettingsIcon,
    get label() { return m.nav_settings() },
    to: '/settings',
    get section() { return m.nav_institution() },
  },
] as const

/** Routes that are not in the sidebar but read the same records. */
const unlistedRequires: Record<string, readonly string[]> = {
  '/procedures': ['prisoner.read'],
}

/** The nav an officer actually sees: role- and permission-filtered, with
 * empty groups dropped. Shared by the sidebar and the command palette so a
 * palette "go" can always reach a sidebar area (and never one the node
 * would refuse). `permissions` may be pending (`undefined`): until the
 * session loads nothing is hidden — the node still refuses either way. */
export function visibleNav(isHeadOffice: boolean, permissions: readonly string[] | undefined): readonly SidebarNavItem[] {
  const allowed = (item: SidebarNavItem) => !permissions || !item.requires || item.requires.some((p) => permissions.includes(p))
  // Head Office groups by institutional responsibility (08 §2.1), not by
  // the facility's Work/People/Institution split (08 §1.1).
  const sectionOverride: Record<string, string> = {
    '/': m.nav_the_network(),
    '/inbox': m.nav_the_network(),
    '/facilities': m.nav_administration(),
    '/reports': m.nav_institutional_work(),
    '/officers': m.nav_administration(),
    '/settings': m.nav_administration(),
  }
  return prisonsNav
    .filter((item) => (isHeadOffice ? !item.facilityOnly : !item.hqOnly))
    .map((item) => ({
      ...item,
      section: isHeadOffice && item.to ? (sectionOverride[item.to] ?? item.section) : item.section,
      ...(item.children ? { children: item.children.filter(allowed) } : {}),
    }))
    .filter((item) => allowed(item) && (!item.children || item.children.length > 0))
}

/** The permissions of which an officer must hold at least one to open
 * `pathname`, or `undefined` when any signed-in officer may. Today (`/`) is
 * left out: it explains a missing permission itself instead of redirecting. */
export function permissionsForPath(pathname: string): readonly string[] | undefined {
  const flat = prisonsNav.flatMap((item) => [item, ...(item.children ?? [])])
  const entries: [string, readonly string[]][] = [
    ...flat.flatMap((item): [string, readonly string[]][] => (item.to && item.to !== '/' && item.requires ? [[item.to, item.requires]] : [])),
    ...Object.entries(unlistedRequires),
  ]
  return entries.find(([to]) => pathname === to || pathname.startsWith(`${to}/`))?.[1]
}

/** The nav entry an area pathname belongs to, for tab titles and icons. `/`
 * is Today for a facility and Overview for Head Office; every other area has
 * one label regardless of role. Unknown paths are not areas. */
export function areaMeta(pathname: string, isHeadOffice = false): { label: string; icon: any } | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const item = prisonsNav
    .flatMap((entry) => [entry, ...(entry.children ?? [])])
    .find((entry) => entry.to === path && (path !== '/' || (isHeadOffice ? entry.hqOnly : entry.facilityOnly)))
  return item ? { label: item.label, icon: item.icon } : undefined
}
