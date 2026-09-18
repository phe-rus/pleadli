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
  /** Facility only, not Head Office (spec: docs/specs/prisons/0001-head-
   * office-peer-sync-network/index.md: "Head Office is purely an
   * aggregator with no prisoners of its own"). Prisoners, Visits, Court
   * Production & Remand, and Requests are about a facility's own
   * operational records, which a Head Office installation never has any
   * of. Filtered by role in `sidebar-provider.tsx`, not by which routes
   * merely exist. */
  facilityOnly?: boolean;
  /** Head Office only, not a facility (same spec as above). Facility
   * management — pairing, verification, revocation — only ever happens
   * from Head Office; a facility installation has no other facility to
   * manage. */
  hqOnly?: boolean;
}

/** Facility navigation follows the work, Head Office navigation follows
 * institutional responsibilities (docs/prisons/product-map/08). Only areas
 * that exist are listed: Today, Movements, Legal and Population are built
 * (phase 2); Care and contact groups the visits and requests routes that
 * pre-date it. Filtering by role happens in `sidebar-provider.tsx`. */
export const prisonsNav: readonly SidebarNavItem[] = [
  {
    icon: DashboardBrowsingIcon,
    label: 'Today',
    to: '/',
    exact: true,
    facilityOnly: true,
  },
  {
    icon: DashboardBrowsingIcon,
    label: 'Overview',
    to: '/',
    exact: true,
    hqOnly: true,
  },
  {
    icon: Search01Icon,
    label: 'Search',
    to: '/search',
  },
  {
    icon: NetworkIcon,
    label: 'Facilities',
    to: '/facilities',
    hqOnly: true,
  },
  {
    icon: ArrowDataTransferHorizontalIcon,
    label: 'Movements',
    to: '/movements',
    facilityOnly: true,
  },
  {
    icon: GavelIcon,
    label: 'Legal',
    to: '/legal',
    facilityOnly: true,
  },
  {
    icon: PrisonerIcon,
    label: 'Population',
    to: '/prisoners',
    facilityOnly: true,
  },
  {
    icon: HandshakeIcon,
    label: 'Care and contact',
    facilityOnly: true,
    children: [
      { icon: HandshakeIcon, label: 'Visits', to: '/visits' },
      { icon: Message01Icon, label: 'Requests and grievances', to: '/requests' },
    ],
  },
  {
    icon: FileEditIcon,
    label: 'Reports',
    to: '/reports',
  },
  {
    icon: UserGroupIcon,
    label: 'Officers',
    to: '/officers',
  },
  {
    icon: SettingsIcon,
    label: 'Settings',
    to: '/settings',
  },
] as const
