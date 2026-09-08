export const searchScopes = ['All', 'People', 'Cases', 'Evidence', 'Statements'] as const

export const searchModes = [
  'Name',
  'NIN / National ID',
  'Passport',
  'Case reference',
  'Phone number',
  'Fingerprint',
  'Face match',
  'Document',
] as const

export type RecentSearch = {
  query: string
  kind: string
  when: string
}

export const recentSearches: readonly RecentSearch[] = [
  { query: 'Wasswa', kind: 'Name', when: '12 min ago' },
  { query: 'CC-2026-0142', kind: 'Case reference', when: '1 h ago' },
  { query: 'NIN 2733-2017…', kind: 'National ID', when: 'yesterday' },
  { query: '039 779 6…', kind: 'Phone number', when: '2 d ago' },
  { query: 'EX-0441', kind: 'Exhibit number', when: '3 d ago' },
]

export type SearchPerson = {
  name: string
  role: 'Complainant' | 'Suspect' | 'Witness' | 'Accused' | 'Victim'
  id: string
  updated: string
}

export type SearchCase = {
  reference: string
  title: string
  status: 'Open' | 'In progress' | 'Waiting referral' | 'Returned'
  officer: string
  updated: string
}

export type SearchEvidence = {
  id: string
  label: string
  kind: string
  updated: string
}

export type Facet = {
  label: string
  count: number
}

export const resultPeople: SearchPerson[] = [
  { name: 'Wasswa, Mungu M.', role: 'Suspect', id: 'P-2041', updated: '3d ago' },
  { name: 'Wasswa, Deborah', role: 'Victim', id: 'P-1872', updated: '1d ago' },
  { name: 'Otema, Wasswa K.', role: 'Witness', id: 'P-1129', updated: '2w ago' },
  { name: 'Kigozi, S.', role: 'Accused', id: 'P-0904', updated: '1w ago' },
]

export const resultCases: SearchCase[] = [
  {
    reference: 'CC-2026-0142',
    title: 'Assault with intent to cause grievous harm',
    status: 'In progress',
    officer: 'AO',
    updated: '2h ago',
  },
  {
    reference: 'CC-2026-0131',
    title: 'Domestic violence',
    status: 'Open',
    officer: 'CM',
    updated: '1d ago',
  },
  {
    reference: 'CC-2026-0117',
    title: 'Burglary',
    status: 'In progress',
    officer: 'AO',
    updated: '3d ago',
  },
]

export const resultEvidence: SearchEvidence[] = [
  { id: 'EX-0441', label: 'Exhibit log · custody', kind: 'Physical · duplicate keys', updated: '3h ago' },
  { id: 'EX-0512', label: 'Scene photographs (roll 7)', kind: 'Digital · 24 frames', updated: '1d ago' },
  { id: 'EX-0388', label: 'Financial records (2025)', kind: 'Document · 41 pages', updated: '5d ago' },
]

export type SearchSuggestion = {
  id: string
  group: string
  label: string
  detail?: string
}

export const searchSuggestions: readonly SearchSuggestion[] = [
  { id: 'p-2041', group: 'People', label: 'Wasswa, Mungu M.', detail: 'Suspect · P-2041' },
  { id: 'p-1872', group: 'People', label: 'Wasswa, Deborah', detail: 'Victim · P-1872' },
  { id: 'p-1129', group: 'People', label: 'Otema, Wasswa K.', detail: 'Witness · P-1129' },
  { id: 'p-0904', group: 'People', label: 'Kigozi, S.', detail: 'Accused · P-0904' },
  { id: 'cc-0142', group: 'Cases', label: 'CC-2026-0142', detail: 'Assault with intent to cause grievous harm' },
  { id: 'cc-0131', group: 'Cases', label: 'CC-2026-0131', detail: 'Domestic violence' },
  { id: 'cc-0117', group: 'Cases', label: 'CC-2026-0117', detail: 'Burglary' },
  { id: 'ex-0441', group: 'Evidence', label: 'EX-0441', detail: 'Duplicate keys · custody' },
  { id: 'ex-0512', group: 'Evidence', label: 'EX-0512', detail: 'Scene photographs (roll 7)' },
  { id: 'ex-0388', group: 'Evidence', label: 'EX-0388', detail: 'Financial records (2025)' },
  { id: 'st-0142', group: 'Statements', label: 'Statement · WAS/KAM/007', detail: 'Wasswa, Deborah' },
  { id: 'mode-fp', group: 'Search modes', label: 'Fingerprint scan' },
  { id: 'mode-face', group: 'Search modes', label: 'Face match' },
  { id: 'mode-nin', group: 'Search modes', label: 'NIN / National ID' },
  { id: 'mode-passport', group: 'Search modes', label: 'Passport' },
  { id: 'mode-doc', group: 'Search modes', label: 'Upload a document to check' },
]

export const typeFacets: Facet[] = [
  { label: 'Person', count: 120 },
  { label: 'Case', count: 12 },
  { label: 'Evidence', count: 6 },
  { label: 'Statement', count: 18 },
]

export const locationFacets: Facet[] = [
  { label: 'This station', count: 156 },
  { label: 'Kampala region', count: 41 },
  { label: 'Uganda-wide', count: 9 },
]