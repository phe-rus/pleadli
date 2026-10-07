import {
  Building02Icon,
  ComputerIcon,
  DashboardBrowsingIcon,
  HelpCircleIcon,
  Key01Icon,
  LayoutTemplateIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

/** Pleadli staff: the institutions and practices on the Orchestra, their
 * licences, the computers running the apps, and what people have written in. */
export const adminNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/admin', exact: true },
  { icon: Building02Icon, label: 'Institutions', to: '/admin/institutions' },
  { icon: Key01Icon, label: 'Licences', to: '/admin/licences' },
  { icon: ComputerIcon, label: 'Computers', to: '/admin/computers' },
  { icon: HelpCircleIcon, label: 'Reports', to: '/admin/reports' },
  { icon: UserGroupIcon, label: 'Users', to: '/admin/users' },
  { icon: LayoutTemplateIcon, label: 'Templates', to: '/admin/templates' },
] as const
