import {
  BarChartIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  Message01Icon,
  PrisonerIcon,
  Search01Icon,
  UserGroupIcon,
  ActivityIcon,
  PackageFreeIcons,
  TruckDeliveryIcon,
  RssIcon,
  FolderSecurityIcon,
  ShieldBanIcon,
  PrisonGuardIcon,
  PackageDimensions01FreeIcons,
  SettingsIcon
} from '@hugeicons/core-free-icons'

// Type definition supplied by the design system
export type SidebarNavItem = {
  to?: string | undefined;
  label: string;
  icon: any | undefined; // Maps to IconSvgElement type
  exact?: boolean;
  children?: readonly SidebarNavItem[];
}

export const prisonsNav: readonly SidebarNavItem[] = [
  {
    icon: DashboardBrowsingIcon,
    label: 'Overview',
    to: '/',
    exact: true
  },
  {
    icon: Search01Icon,
    label: 'Global Node Search',
    to: '/search'
  },

  // ==========================================
  // 1. INMATE MANAGEMENT SUB-TREE
  // Core repository for tracking physical human assets and institutional logs
  // ==========================================
  {
    icon: PrisonerIcon,
    label: 'Inmate Management',
    children: [
      {
        icon: PrisonerIcon,
        label: 'Active Inmates Roster',
        to: '/prisoners'
      },
      {
        icon: UserGroupIcon,
        label: 'Gate Control & Visitors',
        to: '/prisoners/visitors'
      },
      {
        icon: Message01Icon,
        label: 'Requests & Complaints',
        to: '/prisoners/complaints'
      },
    ]
  },

  // ==========================================
  // 2. OPERATIONS & LEGAL LOGISTICS
  // Links physical movements with external JLOS/Court automated APIs
  // ==========================================
  {
    icon: GavelIcon,
    label: 'Operations & Legal',
    children: [
      {
        icon: GavelIcon,
        label: 'Court Production & Remand',
        to: '/operations/remand'
      },
      {
        icon: TruckDeliveryIcon,
        label: 'Escorts & Swarm Transfers',
        to: '/operations/transfers'
      },
    ]
  },

  // ==========================================
  // 3. INSTITUTIONAL SERVICES
  // Specialised medical and industrial systems running locally inside the facility
  // ==========================================
  {
    icon: PackageFreeIcons,
    label: 'Institutional Services',
    children: [
      {
        icon: ActivityIcon,
        label: 'Medical Dashboard & Triage',
        to: '/services/medical'
      },
      {
        icon: PackageDimensions01FreeIcons,
        label: 'Prison Enterprise & Works',
        to: '/services/enterprise'
      },
    ]
  },

  // ==========================================
  // 4. COMMAND, PERSONNEL & INTELLIGENCE
  // Broad administrative controls for station commanders and audit tracking
  // ==========================================
  {
    icon: ShieldBanIcon,
    label: 'Command & Analytics',
    children: [
      {
        icon: PrisonGuardIcon,
        label: 'Staff & Guard Rosters',
        to: '/command/staff'
      },
      {
        icon: BarChartIcon,
        label: 'Ledger Reports & Audits',
        to: '/command/reports'
      }
    ]
  },

  // ==========================================
  // 5. DECENTRALIZED INFRASTRUCTURE PANEL
  // Exposes your custom Tauri Rust network state, local P2P swarm, and encryption logs
  // ==========================================
  {
    icon: FolderSecurityIcon,
    label: 'Network & Security',
    children: [
      {
        icon: RssIcon,
        label: 'Mesh Network Swarm',
        to: '/network/mesh'
      },
      {
        icon: FolderSecurityIcon,
        label: 'Local Cryptography Vault',
        to: '/network/vault'
      },
      {
        icon: SettingsIcon,
        label: 'Node Configurations',
        to: '/network/settings'
      },
    ]
  }
] as const
