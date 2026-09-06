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
  FileEditIcon,
  Search01Icon,
  Building02Icon,
  FlowConnectionIcon,
  BadgeCheckIcon,
  LockKeyIcon,
  Wifi01Icon,
  ShieldEnergyIcon,
} from '@hugeicons/core-free-icons'

export const adminNavItems = [
  { icon: Building02Icon, label: 'Organizations' },
  { icon: FlowConnectionIcon, label: 'Organization units' },
  { icon: UserGroupIcon, label: 'Memberships' },
  { icon: BadgeCheckIcon, label: 'Entitlements' },
] as const

export const trustPoints = [
  {
    icon: LockKeyIcon,
    title: 'Encrypted at rest',
    description:
      'Every record is encrypted with its own key, wrapped separately per institution. Nothing is stored in the clear.',
  },
  {
    icon: Wifi01Icon,
    title: 'Encrypted in transit',
    description: 'Standard TLS everywhere, including real-time hearings, no exceptions.',
  },
  {
    icon: ShieldEnergyIcon,
    title: "Aligned with Uganda's data protection law",
    description:
      'Designed around the Data Protection and Privacy Act, 2019, not bolted on after the fact.',
  },
] as const

export const homeStats = [
  {
    value: '48%',
    description: "of Uganda's prison population is on remand, awaiting trial, not convicted.",
  },
  {
    value: '48 hrs',
    description: 'the constitutional limit for producing a suspect in court after arrest.',
  },
] as const

export const caseTimeline = [
  { icon: PoliceBadgeIcon, label: 'Reported', institution: 'Police' },
  { icon: Briefcase01Icon, label: 'DPP review', institution: 'DPP' },
  { icon: CourtHouseIcon, label: 'Court', institution: 'Courts' },
  { icon: PrisonIcon, label: 'Custody', institution: 'Prisons' },
] as const

export const institutionFeatures = [
  {
    icon: Search01Icon,
    name: 'For Police',
    description:
      "Case intake and investigation stay in the Uganda Police Force's own hands, start to finish.",
    points: [
      'A case gets its shared identity the moment it is opened, before any other institution is involved.',
      'Investigation records, statements, and evidence stay owned by the station and unit that handled them.',
      'Referral to the DPP carries the case identity forward, not a fresh set of paperwork.',
    ],
  },
  {
    icon: FileEditIcon,
    name: 'For DPP',
    description: 'Perusal, sanctioning, and prosecution decisions stay owned by the DPP.',
    points: [
      'A referred case arrives with its investigation history intact, without duplicating the file.',
      'Sanctioning, further-investigation, and decline decisions are recorded against the same case identity.',
      'What Police can see about a DPP decision is what the DPP chooses to expose, not the underlying file.',
    ],
  },
] as const

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

export const institutions = [
  {
    icon: PoliceBadgeIcon,
    name: 'Police',
    status: 'Building now',
    description: 'Investigation, from case intake through referral to the DPP.',
  },
  {
    icon: Briefcase01Icon,
    name: 'DPP',
    status: 'Building now',
    description: 'File perusal, sanctioning, and prosecution decisions.',
  },
  {
    icon: CourtHouseIcon,
    name: 'Courts',
    status: 'Planned',
    description: 'Committal through trial, judgment, and sentencing.',
  },
  {
    icon: GavelIcon,
    name: 'Lawyers',
    status: 'Planned',
    description: 'Representation tied to a case, not a standing login.',
  },
  {
    icon: PrisonIcon,
    name: 'Prisons',
    status: 'Planned',
    description: 'Custody on a warrant of commitment, through to release.',
  },
  {
    icon: UserGroupIcon,
    name: 'Civilian',
    status: 'Planned',
    description: 'A future, separate way for the public to check case status.',
  },
] as const
