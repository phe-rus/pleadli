import {
  DocumentAttachmentIcon,
  AlarmClockIcon,
  Database02Icon,
  PoliceBadgeIcon,
  Briefcase01Icon,
  CourtHouseIcon,
  GavelIcon,
  PrisonIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

export const homeProblems = [
  {
    icon: DocumentAttachmentIcon,
    title: 'Repeated data entry',
    description:
      'The same facts get typed into a new system at every stage, by every institution, for every case.',
  },
  {
    icon: AlarmClockIcon,
    title: 'Slow handoffs',
    description:
      'A case that moves from police to prosecution to court often waits on paperwork to physically catch up.',
  },
  {
    icon: Database02Icon,
    title: 'No shared visibility',
    description:
      'Nobody outside one institution can see where a case actually stands, even when they have a legitimate reason to know.',
  },
] as const

export const caseRecords = [
  {
    icon: PoliceBadgeIcon,
    title: 'Police records',
    description:
      'Investigation details stay owned by police, referenced by the case, never exposed wholesale.',
  },
  {
    icon: Briefcase01Icon,
    title: 'DPP records',
    description: 'Prosecution decisions and files stay owned by DPP, referenced by the same case.',
  },
] as const

export const institutions = [
  { icon: PoliceBadgeIcon, name: 'Police', status: 'Building now' },
  { icon: Briefcase01Icon, name: 'DPP', status: 'Building now' },
  { icon: CourtHouseIcon, name: 'Courts', status: 'Planned' },
  { icon: GavelIcon, name: 'Lawyers', status: 'Planned' },
  { icon: PrisonIcon, name: 'Prisons', status: 'Planned' },
  { icon: UserGroupIcon, name: 'Civilian', status: 'Planned' },
] as const
