import {
  Building02Icon,
  ComputerIcon,
  DashboardBrowsingIcon,
  HelpCircleIcon,
  Key01Icon,
  LayoutTemplateIcon,
  SecurityLockIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { ShellGroup } from '@/components/cloud-shell'

/** Pleadli staff: the institutions and practices on the Orchestra, their
 * licences, the computers running the apps, and what people have written in. */
export const adminGroups: readonly ShellGroup[] = [
  { id: 'home', items: [{ icon: DashboardBrowsingIcon, label: 'Overview', to: '/admin', exact: true }] },
  {
    id: 'customers',
    title: 'Customers',
    items: [
      { icon: Building02Icon, label: 'Institutions', to: '/admin/institutions' },
      { icon: Key01Icon, label: 'Licences', to: '/admin/licences' },
      { icon: ComputerIcon, label: 'Computers', to: '/admin/computers' },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    items: [
      { icon: HelpCircleIcon, label: 'Reports', to: '/admin/reports' },
      { icon: UserGroupIcon, label: 'Users', to: '/admin/users' },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { icon: LayoutTemplateIcon, label: 'Templates', to: '/admin/templates' },
      { icon: SecurityLockIcon, label: 'Signing key', to: '/admin/signing-key' },
    ],
  },
]
