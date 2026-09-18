import {
  DashboardBrowsingIcon,
  FolderViewIcon,
  LegalDocument01Icon,
  Search01Icon,
  SettingsIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

// Reflects docs/dpp/PRODUCT.md §10's proposed navigation, trimmed to what's
// actually built so far (see docs/dpp/PRODUCT.md and the implementation
// notes committed alongside this first vertical slice). Court Matters, Plea
// Bargaining, Documents, Reports & Analytics, and Office Admin are real
// domains in the product model but deliberately not yet given nav entries —
// no half-built empty pages.
export const dppNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  { icon: Search01Icon, label: 'Search', to: '/search' },
  { icon: FolderViewIcon, label: 'Intake', to: '/intake' },
  { icon: LegalDocument01Icon, label: 'Files', to: '/files' },
  { icon: UserGroupIcon, label: 'People', to: '/people' },
  { icon: SettingsIcon, label: 'Settings', to: '/settings' },
] as const
