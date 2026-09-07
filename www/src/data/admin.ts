import {
  DashboardBrowsingIcon,
  Building02Icon,
  LayoutTemplateIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

export const adminNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/admin', exact: true },
  { icon: Building02Icon, label: 'Organizations', to: '/admin/organizations' },
  { icon: LayoutTemplateIcon, label: 'Templates', to: '/admin/templates' },
  { icon: UserGroupIcon, label: 'Users', to: '/admin/users' },
] as const
