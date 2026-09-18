import {
  BarChartIcon,
  DashboardBrowsingIcon,
  GavelIcon,
  Message01Icon,
  PrisonerIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'

// Reflects docs/prisons/PRODUCT.md §8's revised navigation. Health,
// Transfers, Visits, Property & Effects are real domains but deliberately
// live inside the Prisoner workspace, not their own nav entries — no
// half-built browse screens for what's really an event log on one core
// record. Requests & Complaints is a top-level item since a complaint may
// not be tied to one prisoner (the Human Rights Committee/"Mukutano"
// mechanism, RESEARCH.md §11.6).
export const prisonsNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  { icon: Search01Icon, label: 'Search', to: '/search' },
  { icon: PrisonerIcon, label: 'Prisoners', to: '/prisoners' },
  { icon: GavelIcon, label: 'Court Production & Remand', to: '/remand' },
  { icon: Message01Icon, label: 'Requests & Complaints', to: '/requests' },
  { icon: BarChartIcon, label: 'Reports', to: '/reports' },
] as const
