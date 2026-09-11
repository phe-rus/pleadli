import {
  DashboardBrowsingIcon,
  GavelIcon,
  PrisonerIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'

// Reflects docs/prisons/PRODUCT.md §10's proposed navigation, trimmed to
// what's actually built in this first slice. Health, Transfers, and
// Reports are real domains in the product model but deliberately not yet
// given nav entries — no half-built empty pages.
export const prisonsNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  { icon: Search01Icon, label: 'Search', to: '/search' },
  { icon: PrisonerIcon, label: 'Prisoners', to: '/prisoners' },
  { icon: GavelIcon, label: 'Court Production & Remand', to: '/remand' },
] as const
