import {
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
   * aggregator with no prisoners of its own"). Prisoners, Court
   * Production & Remand, and Requests are about prisoners at one facility,
   * which a Head Office installation never has any of. Filtered by role in
   * `sidebar-provider.tsx`, not by which routes merely exist. */
  facilityOnly?: boolean;
  /** Head Office only, not a facility (same spec as above). Facility
   * management — pairing, verification, revocation — only ever happens
   * from Head Office; a facility installation has no other facility to
   * manage. */
  hqOnly?: boolean;
}

/** One entry per real route in `apps/prisons/src/routes/_public/`. Flat on
 * purpose: with only a handful of real destinations, a fake grouped tree
 * (an earlier version of this file) reads as more organised than it is
 * and links to routes that don't exist. Releases, Transfers, Health &
 * Welfare, Property, and Programmes are real features but live inside the
 * Prisoners workspace, not as their own top level routes, so they have no
 * entry here (docs/prisons/PRODUCT.md is the product source of truth;
 * this list is only a starting navigation, per CLAUDE.md). Visits is the
 * one exception: it also gets its own top level route, same as Requests
 * already does, since it's a real enough destination on its own to be
 * findable without opening a specific prisoner first.
 * `Reports` is literally an officer writing a report — a document, not a
 * statistics page; the charts/stat breakdowns that used to live there now
 * live on Overview instead. Search sits right after Overview: it's used
 * constantly, not a secondary destination. */
export const prisonsNav: readonly SidebarNavItem[] = [
  {
    icon: DashboardBrowsingIcon,
    label: 'Overview',
    to: '/',
    exact: true,
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
    icon: UserGroupIcon,
    label: 'Officers',
    to: '/officers',
  },
  {
    icon: PrisonerIcon,
    label: 'Prisoners',
    to: '/prisoners',
    facilityOnly: true,
  },
  {
    icon: HandshakeIcon,
    label: 'Visits',
    to: '/visits',
    facilityOnly: true,
  },
  {
    icon: GavelIcon,
    label: 'Court Production & Remand',
    to: '/remand',
    facilityOnly: true,
  },
  {
    icon: Message01Icon,
    label: 'Requests',
    to: '/requests',
    facilityOnly: true,
  },
  {
    icon: FileEditIcon,
    label: 'Reports',
    to: '/reports',
  },
  {
    icon: SettingsIcon,
    label: 'Settings',
    to: '/settings',
  },
] as const
