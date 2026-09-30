import {
  Briefcase01Icon,
  CourtHouseIcon,
  Database02Icon,
  Folder02Icon,
  GavelIcon,
  LockKeyIcon,
  PoliceBadgeIcon,
  PrisonIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WifiOff02Icon,
} from '@hugeicons/core-free-icons'

export type ReadinessLevel = 'building' | 'early' | 'research'

export const readinessLabel: Record<ReadinessLevel, string> = {
  building: 'Building now',
  early: 'Early build',
  research: 'Research and design',
}

export interface CapabilityNote {
  /** true = real today, false = planned/not built, 'partial' = started but incomplete */
  state: true | false | 'partial'
  detail: string
}

/** A stylized representation of the real workspace shell: brand header,
 * icon ribbon, foldable navigator sections, a tab, and a status bar, the
 * same structure every Pleadli desktop app actually uses (see any app's
 * `features/workspace/{left-pillar,navigator,ribbon,statusbar}.tsx`), with
 * that app's real section and item labels. Not a claimed screenshot. */
export interface ProductMockup {
  subtitle: string
  sections: { label: string; items: string[] }[]
  tab: string
  statusLeft: string
  statusRight: string
  stats: { label: string; value: string }[]
  row: { title: string; meta: string; pill: string }
}

export interface Product {
  slug: string
  icon: typeof PoliceBadgeIcon
  name: string
  institution: string
  tagline: string
  readiness: ReadinessLevel
  /** Short category tag for the homepage teaser card, e.g. "Police work". */
  homeFocus: string
  /** Three crisp bullets for the homepage teaser card, distinct from the longer `features` list on the deep page. */
  homePoints: string[]
  whoFor: string[]
  problem: string
  usage: string
  ownsRecords: string[]
  workflows: { title: string; description: string }[]
  features: string[]
  notYetBuilt: string[]
  offline: CapabilityNote
  security: CapabilityNote
  documents: CapabilityNote
  ai: CapabilityNote
  interchange: string
  mockup: ProductMockup
  download: {
    platforms: string[]
    state: string
    /** Where the Windows installer is published (phe-rus/pleadli-releases), once there is one. */
    release?: { version: string; url: string }
  }
}

export const products: Product[] = [
  {
    slug: 'police',
    icon: PoliceBadgeIcon,
    name: 'Pleadli Police',
    institution: 'Uganda Police Force',
    tagline: 'Investigation and station operations, owned by the station that runs them.',
    readiness: 'building',
    homeFocus: 'Police work',
    homePoints: ['Case intake, investigation & statements', 'Custody tracked against the 48-hour limit', 'Charge sheets & referral to the DPP'],
    whoFor: ['Investigating officers', 'Station duty officers', 'Officers in charge', 'Records and CRB clerks'],
    problem:
      'A case today is typed once into a station diary, again into a CRB entry, again into a charge sheet, and again for every institution downstream. Nothing in that chain is a shared record, so status only exists in whoever last picked up the phone.',
    usage:
      "An officer opens Pleadli Police at the start of a shift to see the station's own open cases, duty roster, and anyone still in custody approaching the 48-hour constitutional limit, then works each case from intake through referral without re-typing the same facts into a separate system.",
    ownsRecords: ['Incident', 'CRB entry', 'Investigation', 'Statements', 'Evidence and exhibits', 'Custody', 'Station diary', 'Investigation actions'],
    workflows: [
      { title: 'Intake to investigation', description: 'An incident becomes a CRB-numbered case, assigned to an investigating officer, without retyping what was already recorded at the desk.' },
      { title: 'Custody and the 48-hour clock', description: 'Everyone currently held is visible against the constitutional production deadline, not tracked from memory or a paper register.' },
      { title: 'Referral to DPP', description: "A case carries its investigation history, statements, and evidence forward to Pleadli DPP as a reference, not a copy the station loses control of." },
    ],
    features: [
      'Case, CRB, and investigation register',
      'Statements and evidence with exhibit numbering',
      'Custody and constitutional deadline tracking',
      'Charge sheet and other station forms',
      'Station diary, duty roster, vehicles, units',
      'Referrals and dispatch to other stations or DPP',
    ],
    notYetBuilt: [
      'Encryption at rest (the one application not yet on the shared node-core security model)',
      'An officer-identity and roles model (station node + command structure)',
      'A real document/file-manager view, and AI features of any kind',
    ],
    offline: { state: true, detail: 'Local encrypted database; no network dependency for daily station work.' },
    security: { state: 'partial', detail: "The local database is now SQLCipher-encrypted at rest, on the same shared key management as the other four applications. Its attachment vault isn't sealed under that key yet, and it doesn't yet have the hash-chained audit trail DPP, Courts, Lawyers, and Prisons have." },
    documents: { state: 'partial', detail: 'Statements, evidence, and station forms are recorded, but Police does not yet have the sealed document vault or reference-numbered issued documents DPP has.' },
    ai: { state: false, detail: 'No AI features are built yet. Planned: transcription of interviews, statement assistance, and case summarization, behind the same provider-agnostic seam described in Security and AI.' },
    interchange: 'Refers a case to Pleadli DPP with its investigation history intact. Police does not go through Courts directly.',
    mockup: {
      subtitle: 'Station workspace',
      sections: [
        { label: 'Front desk', items: ['Station diary', 'Incidents', 'Case intake'] },
        { label: 'Cells and custody', items: ['Custody', 'Bonds and sureties'] },
        { label: 'Investigations', items: ['Investigations', 'Statements', 'Evidence and exhibits'] },
      ],
      tab: 'Custody',
      statusLeft: 'Central Police Station',
      statusRight: '3 in cells',
      stats: [
        { label: 'In custody', value: '3' },
        { label: 'Open cases', value: '12' },
        { label: 'Duty today', value: '5' },
      ],
      row: { title: 'R. Okello', meta: 'Held since 07:42, produce by 06:42 tomorrow', pill: 'Approaching limit' },
    },
    download: { platforms: ['Windows'], state: 'First Windows release, 0.1.0. Installed copies update themselves. Early: in active development and testing, not yet field-validated.', release: { version: '0.1.0', url: 'https://github.com/phe-rus/pleadli-releases/releases/tag/police-v0.1.0' } },
  },
  {
    slug: 'dpp',
    icon: Briefcase01Icon,
    name: 'Pleadli DPP',
    institution: 'Office of the Director of Public Prosecutions',
    tagline: 'Charging decisions and prosecution work, on the file Police actually referred.',
    readiness: 'building',
    homeFocus: 'Prosecution work',
    homePoints: ['Case files moved through seven stages on a board', 'Custody time limits counted by the app, never by AI', 'Charge sheets and court papers sealed with signature, stamp and a verification code'],
    whoFor: ['State attorneys', 'Resident state attorneys', 'Prosecutors reviewing referred files'],
    problem:
      "A prosecutor's decision on a file has real weight, but the file itself is usually a folder that arrived incomplete, and the review that led to a decision leaves no trace once the charge sheet is printed.",
    usage:
      'A prosecutor opens Pleadli DPP to see which files are still awaiting a charging decision, reviews the statements and evidence Police provided, records a legal observation or a formal decision against the file, and generates the resulting charge sheet directly from that record instead of retyping it.',
    ownsRecords: ['Prosecutorial file', 'Review and legal observations', 'Charging decisions', 'Directions', 'Prosecution documents', 'Referrals'],
    workflows: [
      { title: 'File intake from Police', description: 'A referred case arrives with its statements, evidence, and proposed charges intact, so review starts from what actually happened, not a retyped summary.' },
      { title: 'Review and decision', description: 'Legal observations are recorded separately from a formal decision, so the reasoning behind a sanction, decline, or further-investigation direction stays with the file.' },
      { title: 'Charge sheet generation', description: 'The sanctioned charge sheet is produced directly from the decision record, issued with a reference number and a hash, not retyped from notes.' },
    ],
    features: [
      'Case board with seven stages, calendar, tasks and statistics',
      'The file organised into its sections, with scanned papers split, sorted and read by Assist',
      'Legal clocks for custody and remand, counted by the app from what happened',
      'Charging review and per-count decisions, directions and referrals',
      'Documents per country: charge sheets, directions, requests to court, sealed and verifiable, PDF and Word',
      'Country packs for Uganda, Kenya, Tanzania, Rwanda, Burundi, DR Congo, South Sudan and Somalia',
      'First-launch setup, a PIN or password and phone code per person',
      'English, Kiswahili, German and French',
    ],
    notYetBuilt: [
      'The Police side of the Police to DPP exchange (it only ships in DPP today)',
      'A deeper court-matters record: committal, trial-date notices, bail status',
      'Some country details are provisional: file order outside Uganda and Kenya, some ranks and time limits from secondary sources',
    ],
    offline: { state: true, detail: 'Local-first SQLite with the shared node-core vault, works with no connection to Police or Courts.' },
    security: { state: true, detail: 'SQLCipher database, sealed document vault, OS-keystore key, hash-chained audit log, encrypted backups.' },
    documents: { state: true, detail: 'Documents are drafted from the country’s own templates on an A4 letterhead, issued with a number per office and year, sealed with signature and stamp, and carry a verification code and QR anyone can check. PDF and Word export.' },
    ai: { state: 'partial', detail: 'Assist writes a brief of the file, finds contradictions, drafts paragraphs and reads imported papers, with the provider and key the office chooses. Every deadline it mentions is the one the app counted, and what it proposes is adopted only when a prosecutor accepts it.' },
    interchange: 'Receives referrals from Police. Sends committal packages and court notices to Pleadli Courts (design fixed, not yet built).',
    mockup: {
      subtitle: 'Prosecution workspace',
      sections: [
        { label: 'Files', items: ['Incoming', 'Active reviews', 'Returned to Police'] },
        { label: 'Prosecution work', items: ['Charging review', 'Police material', 'Decisions'] },
        { label: 'Office', items: ['People', 'Police connections'] },
      ],
      tab: 'Charging review',
      statusLeft: 'J. Okwir, Senior State Attorney',
      statusRight: '4 files awaiting decision',
      stats: [
        { label: 'Awaiting decision', value: '4' },
        { label: 'Referred this week', value: '9' },
        { label: 'Charge sheets issued', value: '2' },
      ],
      row: { title: 'DPP/2026/0143', meta: 'Referred by Central Police Station, 2 days ago', pill: 'Under review' },
    },
    download: { platforms: ['Windows'], state: 'First Windows release, 0.1.0. Installed copies update themselves. Early: in active development and testing, not yet field-validated.', release: { version: '0.1.0', url: 'https://github.com/phe-rus/pleadli-releases/releases/tag/dpp-v0.1.0' } },
  },
  {
    slug: 'courts',
    icon: CourtHouseIcon,
    name: 'Pleadli Courts',
    institution: 'The Judiciary of Uganda',
    tagline: 'The bench and courtroom workspace, useful with zero connection to ECCMIS.',
    readiness: 'early',
    homeFocus: 'Court work',
    homePoints: ['Register, sittings & structured adjournments', 'Signed sitting record, exhibits, rulings & judgments', 'Chunked, hashed audio recording of a sitting'],
    whoFor: ['Judicial officers (judges, chief magistrates, magistrates)', 'Court clerks', 'Registrars'],
    problem:
      'Most Ugandan courts still run on handwritten notes typed later by a transcriber on old equipment, and the single structured fact the 2011 Auditor-General audit found consistently missing, why a case was adjourned, is exactly the fact that would tell Police, DPP, and Prisons what to fix.',
    usage:
      'A judicial officer opens Pleadli Courts to see the sitting ahead, who is in custody, and what happened last time, records appearances and bench notes during the sitting, then signs the record, which the database itself refuses to alter afterward.',
    ownsRecords: ['Court case', 'Sittings and the signed record', 'Exhibits', 'Orders, rulings, judgments', 'Cause list'],
    workflows: [
      { title: 'The sitting is the core object', description: 'Everything a judicial officer does, appearances, bench notes, exhibits, an outcome, hangs off one appearance of a case before the court.' },
      { title: 'Structured adjournments', description: 'A reason and a responsible party are required fields, not free text, closing the loop back to Police, DPP, and Prisons.' },
      { title: 'The signed record is authoritative', description: 'A judicial officer’s own signed note is the legal record (MCA s.136, TIA s.86). A machine transcript, where one exists, is always a draft that must be adopted, never assumed.' },
    ],
    features: [
      'Register, sittings, and structured adjournments',
      'Cause list, printable',
      'Signed sitting record with database-enforced immutability',
      'Exhibits, rulings, judgments with an offline law library',
      'Chunked, hashed, crash-safe audio recording',
      'Returns and backlog reporting',
    ],
    notYetBuilt: [
      'Field validation with a real magistrate and court clerk (D10, the single highest-leverage open decision)',
      'A transcription engine behind the seam (the seam exists and honestly refuses to invent text)',
      'Roles within the app (no judicial-officer vs. clerk distinction yet), interchange with DPP and Prisons',
    ],
    offline: { state: true, detail: 'Same node-core foundation as DPP and Prisons: SQLCipher, sealed vault, OS-keystore key.' },
    security: { state: true, detail: 'Signed records are frozen by database trigger, not just application logic. Hash-chained audit log.' },
    documents: { state: 'partial', detail: 'Orders, rulings, and judgments are issued with a reference and SHA-256 and frozen, but the wording is a working template, not the Judiciary’s prescribed form, pending research.' },
    ai: { state: 'partial', detail: 'The transcription seam exists and is honest about its own absence: no engine ships yet, the API returns "unavailable" rather than inventing text, and a machine draft can never be adopted into a signed record until a person has corrected it.' },
    interchange: 'Receives committal packages from DPP and production results from Prisons (designed, not yet built). Sends warrants and orders to Prisons.',
    mockup: {
      subtitle: 'Bench workspace',
      sections: [
        { label: 'Bench work', items: ['Cause list', 'Rulings and judgments', 'Orders'] },
        { label: 'Register', items: ['Open cases', 'All cases'] },
        { label: 'Office', items: ['Library', 'Returns'] },
      ],
      tab: 'Cause list',
      statusLeft: 'High Court Criminal Division',
      statusRight: "Today's sittings: 3",
      stats: [
        { label: "Today's sittings", value: '3' },
        { label: 'On the cause list', value: '14' },
        { label: 'Adjourned this week', value: '2' },
      ],
      row: { title: 'HCT-00-CR-0142/2026', meta: '09:30 sitting, mention', pill: 'In session' },
    },
    download: { platforms: ['Windows', 'Linux'], state: 'Not yet publicly distributed. Early build, not field-validated with a real magistrate or court clerk yet.' },
  },
  {
    slug: 'lawyers',
    icon: GavelIcon,
    name: 'Pleadli Lawyers',
    institution: 'Advocates, firms, legal aid providers and paralegals',
    tagline: 'Every kind of legal practice: matters, deadlines, filings, money and registers.',
    readiness: 'early',
    homeFocus: "A lawyer's own practice",
    homePoints: ['Matters of every kind on a board, with court deadlines counted by the rules', 'Sealed filings, PDF and Word export, filing packs', 'Client money kept by the Accounts Rules, fee notes, bills of costs'],
    whoFor: ['Individual advocates', 'Firms and chambers', 'Legal aid providers', 'Paralegals (who draft, but never sign or file)'],
    problem:
      'An advocate needs one place for a matter, its documents, its deadlines and its money that belongs to the practice alone, with privacy the other Pleadli applications do not need in the same way, because privilege is the whole point.',
    usage:
      'At setup a practice says whether it works alone or as a firm and which kinds of work it does; the app then shows only those tools. Matters move across a board by stage, deadlines are counted from what happened, documents are drafted, sealed and filed, and client money is kept apart from the practice’s own.',
    ownsRecords: ['Client', 'Matter and parties', 'Deadlines', 'Drafts, filings and papers', 'Client and office ledgers', 'Fee notes and bills of costs', 'Oaths and notarial registers'],
    workflows: [
      { title: 'Matter opening with a conflict check', description: 'A client, the other side and the kind of matter are recorded once; names are checked against existing clients and parties before the matter opens.' },
      { title: 'Deadlines by the rules', description: 'Recording that a plaint was served or a judgment delivered starts the clocks the Civil Procedure Rules, Court of Appeal Rules and Limitation Act set, with weekend due days flagged.' },
      { title: 'Filing', description: 'Drafts are sealed with the letterhead, signature, stamp and a verification code, filed together as one pack, and exported as PDF or Word.' },
      { title: 'Money and costs', description: 'Client money is never paid out beyond what a client holds; fee notes are issued and paid against; bills of costs are priced by the Sixth Schedule for taxation.' },
    ],
    features: ['Board, list and calendar of matters of 13 kinds', 'Court deadline clocks (Uganda)', 'Documents, sealed filings, filing packs, PDF and Word export', 'Papers read by Assist', 'Client ledgers, fee notes, bills of costs', 'Oaths and notarial registers, practising compliance, pro bono hours', 'Statistics', 'A firm on one office network', 'Export of every record', 'English, Kiswahili, German and French'],
    notYetBuilt: [
      'Hearing notices and orders received from Pleadli Courts',
      'Backups and restore from inside the app',
      'Deadline rules for countries other than Uganda (the other packs are provisional)',
    ],
    offline: { state: true, detail: 'Local encrypted database. In a firm, one office computer holds the practice and the others join it over the office network; nothing needs the internet.' },
    security: { state: true, detail: 'Encrypted database, a PIN or password and phone code per person, roles that decide who may sign, file or pay out, a hash-chained audit trail, and certificate-pinned connections between a firm’s computers.' },
    documents: { state: true, detail: 'Drafts are sealed on filing with letterhead, signature, stamp and a verification code anyone can check; filing packs, PDF and Word export, and every record can be exported.' },
    ai: { state: 'partial', detail: 'Assist summarises a matter, lays out its chronology, finds what the other side has not answered, drafts, and reads scanned papers. It uses the AI provider and key the practice chooses and is off until an administrator turns it on.' },
    interchange: 'Design fixed, not built: signed filings and applications to Courts, hearing notices and orders from Courts. A lawyer never receives another matter’s record.',
    mockup: {
      subtitle: 'Practice workspace',
      sections: [
        { label: 'Practice', items: ['Diary', 'Tasks', 'Documents'] },
        { label: 'Matters', items: ['Open matters', 'All matters'] },
        { label: 'Office', items: ['Clients', 'Time'] },
      ],
      tab: 'Diary',
      statusLeft: 'A. Kintu, Advocate',
      statusRight: 'Hearings this week: 3',
      stats: [
        { label: 'Open matters', value: '6' },
        { label: 'Hearings this week', value: '3' },
        { label: 'Deadlines due', value: '2' },
      ],
      row: { title: 'Nakato v. Uganda', meta: 'Bail application, trial-readiness certificate due', pill: '2 days left' },
    },
    download: { platforms: ['Windows'], state: 'First Windows release, 0.1.0. Installed copies update themselves. Early: not yet field-validated with a practising firm.', release: { version: '0.1.0', url: 'https://github.com/phe-rus/pleadli-releases/releases/tag/lawyers-v0.1.0' } },
  },
  {
    slug: 'prisons',
    icon: PrisonIcon,
    name: 'Pleadli Prisons',
    institution: 'Uganda Prisons Service',
    tagline: 'Custody, welfare, and facility operations, from admission to release.',
    readiness: 'building',
    homeFocus: 'Custody work',
    homePoints: ['Admission on warrant, custody & release', 'Court production & remand, s.118 pre-session list', 'Visits: authorization separate from attendance'],
    whoFor: ['Officers in charge', 'Reception and records officers', 'Welfare and programme officers', 'Head Office coordination'],
    problem:
      'Close to half of Uganda’s prison population is on remand awaiting trial, not convicted, and a paper-based custody register makes it hard to see, at a glance, who is approaching a mandatory-bail threshold or overdue for court production.',
    usage:
      'An officer in charge opens Pleadli Prisons to see who is currently in custody, who is past the constitutional mandatory-bail threshold, and who is scheduled for court production or a visit, then records each event directly against that person’s own record.',
    ownsRecords: ['Admission', 'Custody', 'Prisoner record', 'Production', 'Welfare', 'Visits', 'Requests', 'Rehabilitation', 'Release', 'Transfer'],
    workflows: [
      { title: 'Admission on warrant', description: 'A prisoner is admitted against a real warrant, with custody, property, and reception recorded in one guided sequence, including photos.' },
      { title: 'Court production and remand', description: 'The s.118 pre-session list and remand deadlines are visible before they become a missed production.' },
      { title: 'Facility and Head Office', description: 'A facility works fully offline; Head Office coordinates across facilities over a pinned-TLS LAN exchange when connected, never as a hard requirement.' },
    ],
    features: [
      'Admission, custody, and release',
      'Court production and remand tracking',
      'Visits: six real categories, authorization separate from attendance',
      'Rehabilitation and work programmes with trade-test certification',
      'Property, requests, and complaints',
      'Facility-to-facility exchange, encrypted local database and vault',
    ],
    notYetBuilt: [
      'Watch logs, incidents, discipline, and headquarters coordination features (currently only designed)',
      'A real folder/file-manager for documents (print-oriented records exist; browsing and versioning don’t)',
      'Facility-to-facility exchange tested across two separately packaged machines, not just one',
    ],
    offline: { state: true, detail: 'The most complete offline-first, facility-first model in the ecosystem: a single facility runs entirely on its own without Head Office.' },
    security: { state: true, detail: 'SQLCipher, sealed vault, OS-keystore key, hash-chained audit log, pinned-TLS peer exchange for facility-to-facility and Head Office sync.' },
    documents: { state: true, detail: 'Reception, custody, and reporting documents are recorded with the same node-core vault DPP and Courts use.' },
    ai: { state: false, detail: 'Planned: interview transcription, request/complaint summarization, and correspondence assistance, translation-aware for local languages.' },
    interchange: 'Receives warrants and orders from Courts (designed, not yet built). Reports production results back.',
    mockup: {
      subtitle: 'Facility workspace',
      sections: [
        { label: 'Work', items: ['Today', 'Movements', 'Legal'] },
        { label: 'People', items: ['Population', 'Visits'] },
        { label: 'Institution', items: ['Reports', 'Officers'] },
      ],
      tab: 'Today',
      statusLeft: 'Luzira Upper Prison',
      statusRight: 'In custody: 214',
      stats: [
        { label: 'In custody', value: '214' },
        { label: 'Mandatory bail due', value: '3' },
        { label: 'Visits today', value: '7' },
      ],
      row: { title: 'P. Achen', meta: 'Remand, mandatory-bail threshold in 47h 40m', pill: 'Needs attention' },
    },
    download: { platforms: ['Windows'], state: 'First Windows release, 0.1.0. Installed copies update themselves. Early: in active development and testing, not yet field-validated.', release: { version: '0.1.0', url: 'https://github.com/phe-rus/pleadli-releases/releases/tag/prisons-v0.1.0' } },
  },
]

export function productBySlug(slug: string) {
  return products.find((p) => p.slug === slug)
}

export const platformStory = [
  {
    icon: Database02Icon,
    title: 'One case, many records',
    description:
      'A case can be referenced by every application that legitimately touches it, without any application gaining access to another’s internal records. One case does not mean one shared file.',
  },
  {
    icon: LockKeyIcon,
    title: 'Security is architecture',
    description:
      'Where built (DPP, Courts, Prisons), every record sits behind an encrypted SQLite database, a sealed document vault, and a hash-chained audit log, not a permissions flag bolted on afterward.',
  },
  {
    icon: WifiOff02Icon,
    title: 'Offline first, always',
    description:
      'Every application is designed to be fully useful with no internet connection. Cloud and cross-facility sync supplement local work, they never replace it.',
  },
  {
    icon: Folder02Icon,
    title: 'Documents are the record',
    description:
      'Issued documents carry a reference number, a cryptographic hash, and are frozen once signed, mirroring how the law already treats a signed judicial record.',
  },
  {
    icon: SparklesIcon,
    title: 'AI assists, it never authors the record',
    description:
      'Everywhere AI touches a workflow, the interface distinguishes AI-generated, AI-suggested, human-reviewed, and official record. Nothing adopted without a person reading it first.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Referenceable is not visible',
    description:
      'Connection between institutions never means universal access. What one application exposes to another is an explicit, permissioned exchange, not a shared database.',
  },
]
