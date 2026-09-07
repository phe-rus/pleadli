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
  UserAccountIcon,
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

export const homeProblems = [
  {
    icon: DocumentAttachmentIcon,
    title: 'Repeated data entry',
    description:
      'The same facts get typed into a new system at every institutional boundary, for every case.',
  },
  {
    icon: AlarmClockIcon,
    title: 'Slow handoffs',
    description:
      'A matter that moves from police to prosecution to court often waits on paperwork to physically catch up.',
  },
  {
    icon: Database02Icon,
    title: 'No shared reference',
    description:
      'Nobody outside one institution can confirm where a case actually stands, even with a legitimate reason to know.',
  },
] as const

export const applications = [
  {
    icon: PoliceBadgeIcon,
    name: 'Pleadli Police',
    focus: 'Police work',
    points: ['Case intake', 'Investigation', 'Statements & evidence', 'Referrals'],
    status: 'Building now',
  },
  {
    icon: Briefcase01Icon,
    name: 'Pleadli DPP',
    focus: 'Prosecution work',
    points: ['File perusal', 'Legal assessment', 'Sanctioning decisions', 'Further investigation'],
    status: 'Building now',
  },
  {
    icon: CourtHouseIcon,
    name: 'Pleadli Courts',
    focus: 'Court work',
    points: ['Case progression', 'Hearings', 'Judgments', 'Sentencing'],
    status: 'Designed, not yet built',
  },
  {
    icon: GavelIcon,
    name: 'Pleadli Lawyers',
    focus: "A lawyer's own practice",
    points: ['Matter management', 'Drafting & pleadings', 'Case preparation', 'Representation'],
    status: 'Designed, not yet built',
  },
  {
    icon: PrisonIcon,
    name: 'Pleadli Prisons',
    focus: 'Custody work',
    points: ['Admission on warrant', 'Movement', 'Custody records', 'Release'],
    status: 'Designed, not yet built',
  },
] as const

export const caseRecords = {
  caseId: 'PL-2026-00001180',
  records: [
    {
      icon: PoliceBadgeIcon,
      application: 'Pleadli Police',
      reference: 'CRB reference',
      activity: 'Investigation',
    },
    {
      icon: Briefcase01Icon,
      application: 'Pleadli DPP',
      reference: 'DPP file',
      activity: 'Perusal, decision',
    },
    {
      icon: GavelIcon,
      application: 'Pleadli Lawyers',
      reference: 'Matter',
      activity: 'Representation',
    },
    {
      icon: CourtHouseIcon,
      application: 'Pleadli Courts',
      reference: 'Cause number',
      activity: 'Proceedings',
    },
  ],
} as const

export const applicationSpotlight = [
  {
    icon: Search01Icon,
    name: 'Pleadli Police',
    description:
      "Case intake and investigation stay in the Uganda Police Force's own hands, start to finish.",
    points: [
      'A case gets its shared identity the moment it is opened, before any other application is involved.',
      'Investigation records, statements, and evidence stay owned by the station and unit that handled them.',
      'Referral to the DPP carries the case identity forward, not a fresh set of paperwork.',
    ],
  },
  {
    icon: FileEditIcon,
    name: 'Pleadli DPP',
    description: 'Perusal, sanctioning, and prosecution decisions stay owned by the DPP.',
    points: [
      'A referred case arrives with its investigation history intact, without duplicating the file.',
      'Sanctioning, further-investigation, and decline decisions are recorded against the same case identity.',
      'What Police can see about a DPP decision is what the DPP chooses to expose, not the underlying file.',
    ],
  },
] as const

export const scalingChains = [
  {
    title: 'Pleadli Police, for example',
    steps: [
      { icon: UserAccountIcon, label: 'Police officer' },
      { icon: UserGroupIcon, label: 'Police station' },
      { icon: Building02Icon, label: 'Division or organization' },
      { icon: PoliceBadgeIcon, label: 'Uganda Police Force' },
    ],
  },
  {
    title: 'Pleadli Lawyers, for example',
    steps: [
      { icon: UserAccountIcon, label: 'Individual lawyer' },
      { icon: Building02Icon, label: 'Law firm' },
    ],
  },
] as const
