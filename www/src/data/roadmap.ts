export type RoadmapStatus = 'done' | 'in-progress' | 'planned' | 'research'

export interface RoadmapItem {
  title: string
  application: string
  status: RoadmapStatus
  note: string
}

export const roadmapStatusLabel: Record<RoadmapStatus, string> = {
  done: 'Shipped',
  'in-progress': 'In progress',
  planned: 'Planned',
  research: 'Research needed',
}

export const roadmapStatusOrder: RoadmapStatus[] = ['done', 'in-progress', 'planned', 'research']

/**
 * Kept honest on purpose: an item only moves to "done" once it has been run
 * and verified, not merely written. See each application's page for detail.
 */
export const roadmap: RoadmapItem[] = [
  { title: 'Case intake, investigation, custody, station operations', application: 'Police', status: 'done', note: 'Core station workflow is in daily development use.' },
  { title: 'Encrypted database (SQLCipher, shared key management)', application: 'Police', status: 'done', note: 'On the same node-core model as the other four applications; verified with a real encrypt-in-place round-trip test.' },
  { title: 'Sealed attachment vault, hash-chained audit trail', application: 'Police', status: 'planned', note: 'The database is encrypted; the vault and audit-chain pieces of the shared security model are still ahead.' },
  { title: 'Roles and permissions within a station', application: 'Police', status: 'planned', note: '' },

  { title: 'File intake, review, charging decisions', application: 'DPP', status: 'done', note: '' },
  { title: 'Issued-document pipeline: reference numbers, hashing, export', application: 'DPP', status: 'done', note: 'The most complete document pipeline in the ecosystem today.' },
  { title: 'Interchange with Courts (committal, court notices)', application: 'DPP', status: 'planned', note: 'Design fixed in docs/interchange, not yet built.' },

  { title: 'Register, sittings, structured adjournments, cause list', application: 'Courts', status: 'done', note: 'Verified with a real Rust test suite and a headless UI run.' },
  { title: 'Signed sitting record, exhibits, rulings, judgments', application: 'Courts', status: 'done', note: 'Signed records are frozen by database trigger.' },
  { title: 'Chunked, hashed audio recording of a sitting', application: 'Courts', status: 'done', note: 'Verified: full recording, retry, and playback test suite passes.' },
  { title: 'Transcription engine behind the seam', application: 'Courts', status: 'research', note: 'The seam exists and correctly refuses to invent text. No engine ships. Needs real courtroom audio measurement first, English before local languages.' },
  { title: 'Field validation with a real magistrate and court clerk', application: 'Courts', status: 'research', note: 'Everything above this line is desk research, not yet checked against a real courtroom.' },
  { title: 'Interchange with DPP and Prisons', application: 'Courts', status: 'planned', note: '' },
  { title: 'Live sitting feed to authorised parties on the courtroom LAN', application: 'Courts', status: 'planned', note: '' },
  { title: 'Bail and sentencing worksheets', application: 'Courts', status: 'research', note: 'Waiting on reading the Bail Guidelines 2022 and Sentencing Guidelines 2013.' },

  { title: 'Clients, matters, hearings, notes, documents', application: 'Lawyers', status: 'in-progress', note: 'Written, first real verification pass still owed.' },
  { title: 'Security and privacy layer: vault, audit, app lock', application: 'Lawyers', status: 'planned', note: 'The most important unbuilt piece for this application specifically. See its product page.' },
  { title: 'Advocate workflow research (conflict checks, engagement, privilege)', application: 'Lawyers', status: 'research', note: '' },
  { title: 'Interchange with Courts (filings, orders, hearing notices)', application: 'Lawyers', status: 'planned', note: '' },

  { title: 'Admission, custody, release, court production', application: 'Prisons', status: 'done', note: '' },
  { title: 'Facility-first offline model, Head Office coordination', application: 'Prisons', status: 'done', note: 'A single facility runs fully without Head Office.' },
  { title: 'Pinned-TLS facility-to-facility exchange', application: 'Prisons', status: 'done', note: 'Not yet run across two physical machines.' },
  { title: 'Localization tooling (5 locale catalogs scaffolded)', application: 'Prisons', status: 'in-progress', note: 'The only application with Paraglide wired up. Only English is actually complete and selectable today; Swahili and the rest are scaffolded, extracted area by area as each screen is touched.' },

  { title: 'Shared document/file architecture (folder, version, sign, freeze)', application: 'Platform', status: 'planned', note: 'Each app currently has its own separate document model.' },
  { title: 'Shared AI provider abstraction and context layer', application: 'Platform', status: 'research', note: 'No AI integration exists anywhere in the ecosystem yet.' },
  { title: 'Localization across Police, DPP, Courts, Lawyers', application: 'Platform', status: 'in-progress', note: "Prisons' Paraglide setup proved out in a second application (DPP's Settings, English and a starting Swahili catalog). Police, Courts, and Lawyers still to come." },
  { title: 'Custom institution theming and branding', application: 'Platform', status: 'planned', note: '' },
  { title: 'Update checks and installer distribution', application: 'Platform', status: 'planned', note: 'No updater is wired into any application yet.' },
  { title: 'Signed release/asset API and download infrastructure', application: 'Platform', status: 'planned', note: '' },
  { title: 'Pleadli Cloud public site and lean admin (this site)', application: 'Platform', status: 'in-progress', note: 'You are looking at the first pass.' },
]
