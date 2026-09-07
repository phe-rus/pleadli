import {
  DashboardBrowsingIcon,
  NoteAddIcon,
  Search01Icon,
  Mic01Icon,
  FingerPrintCheckIcon,
  Share08Icon,
  Building06Icon,
} from '@hugeicons/core-free-icons'

export const stationNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  { icon: NoteAddIcon, label: 'Case intake', to: '/intake' },
  { icon: Search01Icon, label: 'Investigations', to: '/investigations' },
  { icon: Mic01Icon, label: 'Statements', to: '/statements' },
  { icon: FingerPrintCheckIcon, label: 'Evidence', to: '/evidence' },
  { icon: Share08Icon, label: 'Referrals', to: '/referrals' },
  { icon: Building06Icon, label: 'Station', to: '/station' },
] as const
