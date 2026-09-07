import {
  Database02Icon,
  EyeIcon,
  FlowConnectionIcon,
  IdentityCardIcon,
  Layers01Icon,
  Location01Icon,
  LockKeyIcon,
  Route01Icon,
} from '@hugeicons/core-free-icons'

export const principles = [
  {
    icon: IdentityCardIcon,
    title: 'One case, one identity',
    description: 'A case keeps the same identity from investigation through to custody.',
  },
  {
    icon: LockKeyIcon,
    title: 'Institution-owned records',
    description: "Each application's records stay with the institution that created them, always.",
  },
  {
    icon: EyeIcon,
    title: 'Referenceable, not visible',
    description: 'Other applications can reference a case without seeing inside it.',
  },
] as const

export const pillars = [
  {
    icon: FlowConnectionIcon,
    title: 'Justice without fragmentation',
    paragraphs: [
      'A single matter can pass through police, prosecution, courts, and prisons, and today each of those stages usually runs on its own paperwork, with almost nothing connecting them. The same facts get re-entered at every handoff, and nobody outside one institution can confirm where a case actually stands.',
      "Pleadli exists so institutions don't have to recreate the same context every time a matter crosses a boundary.",
    ],
  },
  {
    icon: Database02Icon,
    title: 'Connection without centralization',
    paragraphs: [
      "Connecting institutions doesn't mean putting all their records into one shared database. A case gets a continuous identity that follows it across the whole process, but what stays separate is who owns the records: police records belong to police, prosecution decisions belong to the DPP, and so on.",
    ],
  },
  {
    icon: Layers01Icon,
    title: 'Purpose-built software',
    paragraphs: [
      'Police software should feel like police software. DPP software should feel like prosecution software. Court software should feel like court software. A lawyer\'s software should feel like legal practice software. Prison software should feel like custody software.',
      'Pleadli Police, Pleadli DPP, Pleadli Courts, Pleadli Lawyers, and Pleadli Prisons are separate applications, each designed around the work its users actually do, not one dashboard reused everywhere.',
    ],
  },
  {
    icon: Route01Icon,
    title: 'One continuous thread',
    paragraphs: [
      'Responsibility for a matter moves: from an investigating officer, to a prosecutor, to a court, sometimes to a lawyer representing one side. Pleadli lets the underlying matter keep continuity even as that responsibility, and the professionals involved, change.',
    ],
  },
  {
    icon: Location01Icon,
    title: 'Built from Uganda outward',
    paragraphs: [
      "Pleadli is starting with Uganda, designed around the justice system as it actually operates here, not a generic template applied to any country.",
    ],
  },
] as const
