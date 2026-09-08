export type AttentionItem = {
  label: string
  detail: string
  time: string
  severity: 'high' | 'medium' | 'low'
}

export type CaseRow = {
  reference: string
  title: string
  status: 'Open' | 'In progress' | 'Waiting referral' | 'Returned'
  officer: string
  updated: string
}

export type BarDatum = {
  label: string
  value: number
}

export type OfficerLoad = {
  name: string
  count: number
}

export type SupportingFigure = {
  label: string
  value: string | number
  hint?: string
}

export const casesThisMonth = 142
export const casesTrend = {
  delta: 8,
  note: 'vs last month',
} as const

export const supportingFigures: SupportingFigure[] = [
  { label: 'Active investigations', value: 57, hint: '42 at this station' },
  { label: 'Statements recorded', value: 34, hint: 'This week' },
  { label: 'Evidence items', value: 210, hint: '8 need custody follow-up' },
  { label: 'Pending referrals', value: 12, hint: '7 to DPP · 3 to courts' },
]

export const officersOnDuty = {
  current: 18,
  total: 32,
} as const

export const attentionItems: AttentionItem[] = [
  {
    label: 'Referral ready',
    detail: 'Assault case CC-2026-0142 is ready to refer to the DPP',
    time: '2h ago',
    severity: 'high',
  },
  {
    label: 'Evidence action due',
    detail: 'Exhibit EX-0441 needs a custody log entry today',
    time: '3h ago',
    severity: 'high',
  },
  {
    label: 'Returned for investigation',
    detail: 'Theft case CC-2026-0117 was returned by the DPP with queries',
    time: '1d ago',
    severity: 'medium',
  },
  {
    label: 'Statement incomplete',
    detail: 'Witness statement for CC-2026-0131 is missing a follow-up interview',
    time: '1d ago',
    severity: 'medium',
  },
  {
    label: 'Overdue task',
    detail: 'Scene report for the burglary on Kampala Road is pending',
    time: '2d ago',
    severity: 'low',
  },
]

export const caseRows: CaseRow[] = [
  {
    reference: 'CC-2026-0142',
    title: 'Assault with intent to cause grievous harm',
    status: 'In progress',
    officer: 'AO',
    updated: '2h ago',
  },
  {
    reference: 'CC-2026-0138',
    title: 'Theft of motor vehicle',
    status: 'Waiting referral',
    officer: 'BN',
    updated: '5h ago',
  },
  {
    reference: 'CC-2026-0131',
    title: 'Domestic violence',
    status: 'Open',
    officer: 'CM',
    updated: '1d ago',
  },
  {
    reference: 'CC-2026-0124',
    title: 'Land dispute',
    status: 'Returned',
    officer: 'DK',
    updated: '2d ago',
  },
  {
    reference: 'CC-2026-0117',
    title: 'Burglary',
    status: 'In progress',
    officer: 'AO',
    updated: '3d ago',
  },
]

export const casesByType: BarDatum[] = [
  { label: 'Theft', value: 34 },
  { label: 'Assault', value: 28 },
  { label: 'Burglary', value: 19 },
  { label: 'Fraud', value: 12 },
  { label: 'Other', value: 21 },
]

export const weeklyFlow: BarDatum[] = [
  { label: 'W1', value: 18 },
  { label: 'W2', value: 22 },
  { label: 'W3', value: 17 },
  { label: 'W4', value: 24 },
  { label: 'W5', value: 20 },
  { label: 'W6', value: 27 },
  { label: 'W7', value: 23 },
  { label: 'W8', value: 26 },
]

export const officersLoad: OfficerLoad[] = [
  { name: 'D/SGT Okello', count: 12 },
  { name: 'SGT Namutebi', count: 9 },
  { name: 'CPL Wasswa', count: 8 },
  { name: 'PC Musinguzi', count: 6 },
]

export const referralsByDestination: BarDatum[] = [
  { label: 'DPP', value: 7 },
  { label: 'Courts', value: 3 },
  { label: 'Prisons', value: 1 },
  { label: 'Other', value: 1 },
]