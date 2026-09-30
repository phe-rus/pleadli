import {
  Briefcase01Icon,
  FlowConnectionIcon,
  PoliceBadgeIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

export const docsNav = [
  { slug: '', title: 'Overview', to: '/docs' },
  { slug: 'how-it-works', title: 'How it works', to: '/docs/how-it-works' },
  { slug: 'applications', title: 'Applications', to: '/docs/applications' },
  { slug: 'security', title: 'Security', to: '/docs/security' },
  { slug: 'documents', title: 'Documents', to: '/docs/documents' },
  { slug: 'ai', title: 'AI', to: '/docs/ai' },
] as const

export const orgModel = [
  {
    icon: FlowConnectionIcon,
    title: 'Organization',
    description: 'One row per institution. Flat: Police, DPP, and future institutions sit side by side.',
  },
  {
    icon: PoliceBadgeIcon,
    title: 'Organization unit',
    description:
      'Self-referencing hierarchy within one institution, headquarters down to a station or office.',
  },
  {
    icon: UserGroupIcon,
    title: 'Membership',
    description: 'Which user belongs to which unit, and their title there.',
  },
  {
    icon: Briefcase01Icon,
    title: 'Entitlement',
    description: 'Whether an institution is allowed to use a given Pleadli application at all.',
  },
] as const
