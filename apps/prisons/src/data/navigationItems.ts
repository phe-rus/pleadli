import {
  ArrowDataTransferHorizontalIcon,
  FileEditIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  HandshakeIcon,
  Message01Icon,
  NetworkIcon,
  PrisonerIcon,
  Search01Icon,
  SettingsIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

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
    label: 'Search',
    to: '/search',
    requires: ['prisoner.read', 'hq.locate'],
  },
  {
    icon: DashboardBrowsingIcon,
    label: 'Today',
    to: '/',
    exact: true,
    facilityOnly: true,
    requires: ['prisoner.read'],
    section: 'Work',
  },
  {
    icon: DashboardBrowsingIcon,
    label: 'Overview',
    to: '/',
    exact: true,
    hqOnly: true,
    section: 'The network',
  },
  {
    icon: ArrowDataTransferHorizontalIcon,
    label: 'Movements',
    to: '/movements',
    facilityOnly: true,
    requires: ['prisoner.read'],
    section: 'Work',
  },
  {
    icon: GavelIcon,
    label: 'Legal',
    to: '/legal',
    facilityOnly: true,
    requires: ['prisoner.read'],
    section: 'Work',
  },
  {
    icon: PrisonerIcon,
    label: 'Population',
    to: '/prisoners',
    facilityOnly: true,
    requires: ['prisoner.read'],
    section: 'People',
  },
  {
    icon: HandshakeIcon,
    label: 'Care and contact',
    facilityOnly: true,
    section: 'People',
    children: [
      { icon: HandshakeIcon, label: 'Visits', to: '/visits', requires: ['prisoner.read'] },
      { icon: Message01Icon, label: 'Requests and grievances', to: '/requests', requires: ['prisoner.read'] },
    ],
  },
  {
    icon: FileEditIcon,
    label: 'Reports',
    to: '/reports',
    requires: ['report.read', 'hq.reports'],
    section: 'Institution',
  },
  {
    icon: NetworkIcon,
    label: 'Facilities',
    to: '/facilities',
    hqOnly: true,
    section: 'Administration',
  },
  {
    icon: UserGroupIcon,
    label: 'Officers',
    to: '/officers',
    section: 'Institution',
  },
  {
    icon: SettingsIcon,
    label: 'Settings',
    to: '/settings',
    section: 'Institution',
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
    '/': 'The network',
    '/facilities': 'Administration',
    '/reports': 'Institutional work',
    '/officers': 'Administration',
    '/settings': 'Administration',
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

/** Which routes a segment label belongs to, used by the breadcrumb: the
 * label of a known nav route, then the procedure names that live under
 * the routes that are not in the sidebar. Nothing else is ever guessed. */
const pathLabels: Record<string, string> = Object.fromEntries(
  prisonsNav
    .flatMap((item) => [item, ...(item.children ?? [])])
    .flatMap((item) => (item.to ? [[item.to, item.label] as const] : [])),
)
const procedureLabels: Record<string, string> = {
  '/procedures': 'Procedures',
  '/procedures/reception': 'Reception',
  '/procedures/receive': 'Receive a transfer',
  '/procedures/arrival': 'Arrival confirmation',
  '/procedures/discharge': 'Discharge',
  '/procedures/transfer': 'Transfer',
}

/** Breadcrumb label for one pathname prefix: resolves to the nav label
 * (Population, Movements…) or a procedure name (Reception, Discharge…)
 * before falling back to the raw segment. The breadcrumb's job is
 * orientation in the tree, never a fabricated name for an unknown route. */
export function breadcrumbSegmentLabel(prefix: string, segment: string): string {
  return pathLabels[prefix] ?? procedureLabels[prefix] ?? segment
}
