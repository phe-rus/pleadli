import { localized } from '@/lib/localized'
import { roadmapStatusText, roadmapText } from './i18n/roadmap'
export type RoadmapStatus = 'done' | 'in-progress' | 'planned' | 'research'

export interface RoadmapItem {
  title: string
  application: string
  status: RoadmapStatus
  note: string
}

const roadmapStatusLabelBase: Record<RoadmapStatus, string> = {
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
const roadmapBase: RoadmapItem[] = [
  { title: 'Windows installers for Police, DPP, Lawyers and Prisons', application: 'Platform', status: 'done', note: 'Version 0.1.0, built and published by an automated release workflow. Not yet code-signed.' },
  { title: 'Signed automatic updates', application: 'Platform', status: 'done', note: 'Installed copies check for an update signed with Pleadli’s key and ask before installing. The first update round trip has not happened yet.' },
  { title: 'One first-launch setup: country, language, office, protection, colour and logo, first people', application: 'Platform', status: 'done', note: 'Shared by DPP and Lawyers. Police and Prisons move onto it next.' },
  { title: 'Country packs for eight East African countries', application: 'Platform', status: 'in-progress', note: 'Uganda, Kenya, Tanzania, Rwanda, Burundi, DR Congo, South Sudan and Somalia: courts, laws, references, time limits. Some details are provisional or from secondary sources, and marked so.' },
  { title: 'Assist: AI with the provider and key the office chooses', application: 'Platform', status: 'done', note: 'Built in DPP and Lawyers. Deadlines are always counted by the app, never by the AI.' },
  { title: 'English, Kiswahili, German and French', application: 'Platform', status: 'in-progress', note: 'Complete in DPP and on this site; Lawyers’ newer screens are translated and its older ones are being finished; Police and Prisons follow.' },
  { title: 'Code-signed installers, checksums, Linux and macOS', application: 'Platform', status: 'planned', note: 'Until then Windows shows a SmartScreen warning on first install.' },

  { title: 'Case intake, investigation, custody, station operations', application: 'Police', status: 'done', note: 'Core station workflow.' },
  { title: 'Encrypted database', application: 'Police', status: 'done', note: 'Same shared key management as the other applications.' },
  { title: 'First-launch setup, sign-in and roles', application: 'Police', status: 'planned', note: 'Next: onto the shared setup DPP and Lawyers use.' },
  { title: 'Sealed attachment vault and hash-chained audit trail', application: 'Police', status: 'planned', note: '' },

  { title: 'Case board, file sections, calendar, tasks, statistics', application: 'DPP', status: 'done', note: '' },
  { title: 'Legal clocks for custody and remand, per country', application: 'DPP', status: 'done', note: 'Counted by the app from recorded events.' },
  { title: 'Documents per country, sealed and verifiable', application: 'DPP', status: 'done', note: 'Uganda and DR Congo checked in a real browser; the other packs use common-law or parquet templates.' },
  { title: 'Scanned papers split, sorted and read', application: 'DPP', status: 'done', note: '' },
  { title: 'Interchange with Police and Courts', application: 'DPP', status: 'planned', note: 'Design fixed, not yet built.' },

  { title: 'Register, sittings, structured adjournments, cause list', application: 'Courts', status: 'done', note: 'Verified with a Rust test suite and a headless UI run.' },
  { title: 'Signed sitting record, exhibits, rulings, judgments', application: 'Courts', status: 'done', note: 'Signed records are frozen by database trigger.' },
  { title: 'Chunked, hashed audio recording of a sitting', application: 'Courts', status: 'done', note: '' },
  { title: 'First Windows release', application: 'Courts', status: 'planned', note: 'Courts is the one application not yet released.' },
  { title: 'Transcription engine behind the seam', application: 'Courts', status: 'research', note: 'The seam refuses to invent text. Needs real courtroom audio first.' },
  { title: 'Field validation with a real magistrate and court clerk', application: 'Courts', status: 'research', note: '' },

  { title: 'Every kind of practice: matter types, stages, board, conflict check', application: 'Lawyers', status: 'done', note: 'Alone or as a firm; usages chosen at setup.' },
  { title: 'Court deadline clocks (Uganda rules)', application: 'Lawyers', status: 'done', note: 'Civil Procedure Rules, Court of Appeal Rules, Limitation Act, notice to Government.' },
  { title: 'Sealed filings, filing packs, PDF and Word export', application: 'Lawyers', status: 'done', note: '' },
  { title: 'Client money, fee notes, bills of costs', application: 'Lawyers', status: 'done', note: 'Accounts Rules enforced; bills priced by the Sixth Schedule.' },
  { title: 'Oaths and notarial registers, practising compliance, statistics', application: 'Lawyers', status: 'done', note: '' },
  { title: 'A firm on one office network', application: 'Lawyers', status: 'done', note: 'Checked with two copies on one computer; not yet across two physical machines.' },
  { title: 'Export of every record', application: 'Lawyers', status: 'done', note: 'One ZIP: JSON plus a spreadsheet per kind of record.' },
  { title: 'Hearing notices and orders from Courts', application: 'Lawyers', status: 'planned', note: '' },

  { title: 'Admission, custody, release, court production', application: 'Prisons', status: 'done', note: '' },
  { title: 'Facility-first offline model, Head Office coordination', application: 'Prisons', status: 'done', note: 'A facility runs fully without Head Office.' },
  { title: 'Pinned-TLS facility to Head Office exchange', application: 'Prisons', status: 'done', note: 'Not yet run across two physical machines.' },
  { title: 'Shared setup, legal clocks and Assist from DPP', application: 'Prisons', status: 'planned', note: 'Next for Prisons.' },

  { title: 'Pleadli Cloud public site and lean admin (this site)', application: 'Platform', status: 'in-progress', note: 'Downloads live; four languages.' },
]

export const getRoadmap = () => localized(roadmapBase, roadmapText)
export const getRoadmapStatusLabel = () => localized(roadmapStatusLabelBase, roadmapStatusText)
