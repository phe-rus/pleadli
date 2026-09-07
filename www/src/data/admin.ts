import { DashboardBrowsingIcon, Building02Icon, UserGroupIcon } from '@hugeicons/core-free-icons'

export const adminNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/admin', exact: true },
  { icon: Building02Icon, label: 'Organizations', to: '/admin/organizations' },
  { icon: UserGroupIcon, label: 'Users', to: '/admin/users' },
] as const
