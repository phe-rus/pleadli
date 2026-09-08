import {
  BinocularsIcon,
  Building06Icon,
  DashboardBrowsingIcon,
  FingerPrintCheckIcon,
  FolderViewIcon,
  Mic01Icon,
  Search01Icon,
  Share08Icon,
  SirenIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

export const stationNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  { icon: Search01Icon, label: 'Search', to: '/search' },
  { icon: UserGroupIcon, label: 'People', to: '/people' },
  { icon: SirenIcon, label: 'Incidents', to: '/incidents' },
  { icon: FolderViewIcon, label: 'Case intake', to: '/intake' },
  { icon: BinocularsIcon, label: 'Investigations', to: '/investigations' },
  { icon: Mic01Icon, label: 'Statements', to: '/statements' },
  { icon: FingerPrintCheckIcon, label: 'Evidence', to: '/evidence' },
  { icon: Share08Icon, label: 'Referrals', to: '/referrals' },
  { icon: Building06Icon, label: 'Station', to: '/station' },
] as const
