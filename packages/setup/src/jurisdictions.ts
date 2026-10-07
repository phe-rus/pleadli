import type { Institution, Locale, PackStatus, Text } from './types'

/**
 * Jurisdiction packs: the country-specific data every Pleadli app reads.
 *
 * Evidence and confidence for every entry: docs/platform/REVIEW-2026-09-28.md
 * §3, docs/police/research/, docs/dpp/research/, docs/prisons/jurisdictions/.
 * Terms of art (CRB, OB, RB, Js, NPP) are never translated. A value that no
 * source confirmed is `null`, never a guess.
 */

export type ReferenceKind = 'police' | 'prosecution' | 'court'

export type Reference = {
  /** The name the institution itself uses, in its own language. */
  label: string
  /** A real, cited example, or null when no format was confirmed. */
  example: string | null
}

/** What a document in a file is, the same in every country. Which section
 * of the file it sits in is each country's (`FileSection.kinds`). */
export type DocKind =
  | 'complaint'
  | 'initial_report'
  | 'witness_statement'
  | 'accused_statement'
  | 'exhibit'
  | 'expert_report'
  | 'medical_report'
  | 'detention'
  | 'investigation_diary'
  | 'charge_sheet'
  | 'lists'
  | 'io_report'
  | 'minute'
  | 'correspondence'
  | 'decision'
  | 'court_record'
  | 'other'

export const DOC_KINDS: readonly { id: DocKind; label: Text }[] = [
  { id: 'complaint', label: { en: 'Complaint', sw: 'Malalamiko', fr: 'Plainte' } },
  { id: 'initial_report', label: { en: 'First report', sw: 'Taarifa ya kwanza', fr: 'Premier rapport' } },
  { id: 'witness_statement', label: { en: 'Witness statement', sw: 'Maelezo ya shahidi', fr: 'Déclaration de témoin' } },
  { id: 'accused_statement', label: { en: "Accused's statement", sw: 'Maelezo ya mshtakiwa', fr: 'Déclaration du prévenu' } },
  { id: 'exhibit', label: { en: 'Exhibit or document', sw: 'Kielelezo au hati', fr: 'Pièce ou document' } },
  { id: 'expert_report', label: { en: 'Expert report', sw: 'Ripoti ya mtaalamu', fr: "Rapport d'expertise" } },
  { id: 'medical_report', label: { en: 'Medical report', sw: 'Ripoti ya matibabu', fr: 'Certificat médical' } },
  { id: 'detention', label: { en: 'Detention paper', sw: 'Hati ya kizuizi', fr: 'Pièce de détention' } },
  { id: 'investigation_diary', label: { en: 'Investigation diary', sw: 'Shajara ya upelelezi', fr: "Journal d'enquête" } },
  { id: 'charge_sheet', label: { en: 'Charge sheet', sw: 'Hati ya mashtaka', fr: "Acte d'accusation" } },
  { id: 'lists', label: { en: 'List (witnesses, exhibits, record)', sw: 'Orodha (mashahidi, vielelezo, rekodi)', fr: 'Liste (témoins, scellés, casier)' } },
  { id: 'io_report', label: { en: "Investigator's report", sw: 'Ripoti ya mpelelezi', fr: "Rapport de l'enquêteur" } },
  { id: 'minute', label: { en: 'Minute', sw: 'Kumbukumbu', fr: 'Minute' } },
  { id: 'correspondence', label: { en: 'Letter', sw: 'Barua', fr: 'Lettre' } },
  { id: 'decision', label: { en: 'Decision', sw: 'Uamuzi', fr: 'Décision' } },
  { id: 'court_record', label: { en: 'Court record', sw: 'Kumbukumbu ya mahakama', fr: 'Pièce du tribunal' } },
  { id: 'other', label: { en: 'Other', sw: 'Nyingine', fr: 'Autre' } },
]

export type FileSection = { code: string; title: Text; kinds: readonly DocKind[] }

/** A statute or guideline the office works under, named as it is cited
 * there. `cite` is the edition or number when a source confirmed it. */
export type Statute = { title: string; cite: string | null }

/** A dated custody fact on a file. The same everywhere; which ones matter
 * is set by the country's time limits. */
export type CustodyKind = 'arrest' | 'court_production' | 'remand' | 'remand_both' | 'remand_high_court' | 'map' | 'odp' | 'odp_extension' | 'bail' | 'release' | 'trial_start'

export const CUSTODY_KINDS: readonly { id: CustodyKind; label: Text }[] = [
  { id: 'arrest', label: { en: 'Arrested', sw: 'Alikamatwa', fr: 'Arrêté' } },
  { id: 'court_production', label: { en: 'Brought before a court', sw: 'Alifikishwa mahakamani', fr: 'Présenté au juge' } },
  { id: 'remand', label: { en: 'Remanded in custody to the next hearing', sw: 'Rumande hadi usikilizwaji ujao', fr: "Renvoyé en détention jusqu'à la prochaine audience" } },
  { id: 'remand_both', label: { en: 'Remanded (offence triable by both courts)', sw: 'Rumande (kosa linalosikilizwa na mahakama zote)', fr: 'Détention (infraction jugeable par les deux juridictions)' } },
  { id: 'remand_high_court', label: { en: 'Remanded (High Court offence)', sw: 'Rumande (kosa la Mahakama Kuu)', fr: 'Détention (infraction de la Haute Cour)' } },
  { id: 'map', label: { en: "Prosecutor's provisional arrest warrant", sw: 'Hati ya muda ya kukamatwa ya mwendesha mashtaka', fr: "Mandat d'arrêt provisoire (MAP)" } },
  { id: 'odp', label: { en: 'Pre-trial detention order', sw: 'Amri ya kizuizi kabla ya kesi', fr: 'Ordonnance de détention préventive (ODP)' } },
  { id: 'odp_extension', label: { en: 'Detention extended', sw: 'Kizuizi kiliongezwa', fr: 'Détention prorogée' } },
  { id: 'bail', label: { en: 'Released on bail', sw: 'Aliachiliwa kwa dhamana', fr: 'Liberté provisoire' } },
  { id: 'release', label: { en: 'Released', sw: 'Aliachiliwa', fr: 'Libéré' } },
  { id: 'trial_start', label: { en: 'Trial began', sw: 'Kesi ilianza', fr: 'Procès ouvert' } },
]

/** A time limit the law puts on custody: how long, started by which event,
 * ended by which, and where it comes from. `from` says whether the clock
 * runs from the first start (a total, like Uganda's remand) or the latest
 * (each warrant or extension on its own). `source` is P (read in the text)
 * or S (secondary). */
export type TimeLimit = {
  id: string
  label: Text
  hours: number
  basis: string
  source: 'P' | 'S'
  starts: readonly CustodyKind[]
  stops: readonly CustodyKind[]
  from: 'first' | 'latest'
}

/** The decision kinds a prosecutor can record. Each country offers the ones
 * its law has, under its own name for them. */
export type DecisionKind =
  | 'sanction'
  | 'threshold_charge'
  | 'decline'
  | 'divert'
  | 'return_for_investigation'
  | 'take_over'
  | 'discontinue'
  | 'nolle_prosequi'
  | 'plea_bargain_accepted'
  | 'committal_venue_high_court'
  | 'amend_charge'

export type DecisionOption = { kind: DecisionKind; label: Text }

export type InstitutionPack = {
  /** The institution's own name, in its own language. */
  name: string
  /** What people there call it for short ("ODPP", "Parquet", "NPS"). */
  short?: string
  /** The title of its head, as the law names it. */
  head?: string
  /** The head's title for short ("DPP", "PG"). */
  headShort?: string
  /** The heading lines of its official documents, top to bottom. `{office}`
   * is the office's name, `{OFFICE}` the same in capitals. */
  letterhead?: readonly string[]
  /** Its national office, when it has one. Null: no headquarters model. */
  headquarters: string | null
  /** Suggested ranks or grades, highest first. Empty when unconfirmed. */
  ranks: readonly string[]
}

export type Country = {
  code: string
  name: Text
  area: 'east_africa'
  status: PackStatus
  /** Languages people work in there, among the ones Pleadli ships. */
  languages: readonly Locale[]
  defaultLanguage: Locale
  /** What an office groups under, and the list when it is known. */
  regionLabel: Text
  regions: readonly string[]
  references: Record<ReferenceKind, Reference>
  institutions: Partial<Record<Institution, InstitutionPack>>
  /** The order of a prosecution file, and whether it is confirmed there. */
  fileSections: { status: PackStatus; sections: readonly FileSection[] } | null
  /** Criminal courts, lowest first, by their own names. Empty when unknown. */
  courts: readonly string[]
  /** What the office works under. Empty when not yet researched. */
  laws: readonly Statute[]
  /** Limits the file must respect (custody, remand). Empty when unknown. */
  timeLimits: readonly TimeLimit[]
  /** The decisions this country's prosecutors take. Null: not researched,
   * the app's general set applies. */
  decisions: readonly DecisionOption[] | null
}

const region: Text = { en: 'Region', sw: 'Mkoa', fr: 'Région' }

const BEFORE_COURT: Text = { en: 'Before a court', sw: 'Kufikishwa mahakamani', fr: 'Présentation au tribunal' }

/** Kenya's lettered police file (National Police Service standing orders, as
 * taught at the Kenya School of Law). Used provisionally where a country's own
 * order is not published (decision D3). */
const LETTERED_FILE: readonly FileSection[] = [
  { code: 'A', title: { en: 'Initial reports', sw: 'Taarifa za awali', fr: 'Rapports initiaux' }, kinds: ['complaint', 'initial_report'] },
  { code: 'B', title: { en: 'Documentary evidence', sw: 'Ushahidi wa nyaraka', fr: 'Preuves documentaires' }, kinds: ['exhibit'] },
  { code: 'C', title: { en: 'Expert reports', sw: 'Ripoti za wataalamu', fr: "Rapports d'expertise" }, kinds: ['expert_report', 'medical_report'] },
  { code: 'D', title: { en: 'Witness statements', sw: 'Maelezo ya mashahidi', fr: 'Déclarations des témoins' }, kinds: ['witness_statement'] },
  { code: 'E', title: { en: "Accused's statements", sw: 'Maelezo ya mshtakiwa', fr: "Déclarations de l'accusé" }, kinds: ['accused_statement'] },
  { code: 'F', title: { en: 'Investigation diary', sw: 'Shajara ya upelelezi', fr: "Journal d'enquête" }, kinds: ['investigation_diary', 'detention'] },
  { code: 'G', title: { en: 'Charge sheets', sw: 'Hati za mashtaka', fr: "Actes d'accusation" }, kinds: ['charge_sheet'] },
  { code: 'H', title: { en: 'Lists: witnesses, exhibits, record', sw: 'Orodha: mashahidi, vielelezo, rekodi', fr: 'Listes : témoins, scellés, casier' }, kinds: ['lists'] },
  { code: 'I', title: { en: 'Investigating officer\'s report', sw: 'Ripoti ya mpelelezi', fr: "Rapport de l'enquêteur" }, kinds: ['io_report'] },
  { code: 'J', title: { en: 'Minute sheet', sw: 'Karatasi ya kumbukumbu', fr: 'Feuille de minutes' }, kinds: ['minute', 'correspondence', 'decision', 'court_record', 'other'] },
]

export const COUNTRIES: readonly Country[] = [
  {
    code: 'ug',
    name: { en: 'Uganda', sw: 'Uganda', fr: 'Ouganda' },
    area: 'east_africa',
    status: 'ready',
    languages: ['en', 'sw'],
    defaultLanguage: 'en',
    regionLabel: region,
    // ODPP's 16 regions (archived dpp.go.ug, Dec 2023) plus Luwero, Moroto and
    // Tororo, upgraded in FY2023/24 (Vote 133 policy statement): 19 in all.
    regions: ['Arua', 'Fort Portal', 'Gulu', 'Jinja', 'Kabale', 'Kampala', 'Lira', 'Luwero', 'Masaka', 'Masindi', 'Mbale', 'Mbarara', 'Moroto', 'Mpigi', 'Mubende', 'Mukono', 'Nakawa', 'Soroti', 'Tororo'],
    references: {
      police: { label: 'Police reference (CRB)', example: 'JINJA CRB 314/2019' },
      prosecution: { label: 'ODPP registration number', example: null },
      court: { label: 'Court case number', example: 'HCT-00-CR-SC-0123-2026' },
    },
    institutions: {
      dpp: {
        letterhead: ["THE REPUBLIC OF UGANDA", "OFFICE OF THE DIRECTOR OF PUBLIC PROSECUTIONS", "{office}"],
        name: 'Office of the Director of Public Prosecutions',
        short: 'ODPP',
        head: 'Director of Public Prosecutions',
        headShort: 'DPP',
        headquarters: 'ODPP Headquarters, Kampala',
        ranks: ['Director of Public Prosecutions', 'Deputy Director of Public Prosecutions', 'Principal Assistant DPP', 'Assistant DPP', 'Chief State Attorney', 'Senior State Attorney', 'State Attorney', 'Resident State Attorney', 'Resident State Prosecutor'],
      },
      police: { name: 'Uganda Police Force', headquarters: 'Police Headquarters, Naguru', ranks: [] },
      prisons: { name: 'Uganda Prisons Service', headquarters: 'Prisons Headquarters, Kampala', ranks: [] },
    },
    fileSections: { status: 'provisional', sections: LETTERED_FILE },
    courts: ["Magistrate Grade I", "Chief Magistrate's Court", 'High Court', 'Court of Appeal', 'Supreme Court'],
    // docs/dpp/RESEARCH.md; Magistrates Courts Act chapter from the 2023
    // consolidated text read there. Other 2023 chapter numbers not confirmed.
    laws: [
      { title: 'Constitution of the Republic of Uganda, 1995', cite: null },
      { title: 'Penal Code Act', cite: null },
      { title: 'Criminal Procedure Code Act', cite: null },
      { title: 'Magistrates Courts Act', cite: 'Cap. 19 (2023)' },
      { title: 'Trial on Indictments Act', cite: null },
      { title: 'Evidence Act', cite: null },
      { title: 'Children Act', cite: null },
      { title: 'Judicature (Plea Bargain) Rules, 2016', cite: null },
      { title: 'ODPP Decision to Charge Guidelines, 2023', cite: null },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: { en: 'Before a court', sw: 'Kufikishwa mahakamani', fr: 'Présentation au tribunal' },
        hours: 48,
        basis: 'Constitution Art. 23(4)(b)',
        source: 'P',
        starts: ['arrest'],
        stops: ['court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'remand_subordinate',
        label: { en: 'Remand, then bail (both courts)', sw: 'Rumande, kisha dhamana (mahakama zote)', fr: 'Détention provisoire, puis caution (deux juridictions)' },
        hours: 60 * 24,
        basis: 'Constitution Art. 23(6)(b)',
        source: 'P',
        starts: ['remand_both'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
      {
        id: 'remand_high_court',
        label: { en: 'Remand, then bail (High Court only)', sw: 'Rumande, kisha dhamana (Mahakama Kuu tu)', fr: 'Détention provisoire, puis caution (Haute Cour seule)' },
        hours: 180 * 24,
        basis: 'Constitution Art. 23(6)(c)',
        source: 'P',
        starts: ['remand_high_court'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
    ],
    decisions: null,
  },
  {
    code: 'ke',
    name: { en: 'Kenya', sw: 'Kenya', fr: 'Kenya' },
    area: 'east_africa',
    status: 'provisional',
    languages: ['en', 'sw'],
    defaultLanguage: 'en',
    regionLabel: { en: 'County', sw: 'Kaunti', fr: 'Comté' },
    // The 47 counties (Constitution of Kenya, 2010, First Schedule).
    regions: ['Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a", 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'],
    references: {
      police: { label: 'OB / CR number', example: 'OB 8/10/03/2023' },
      prosecution: { label: 'ODPP file number', example: null },
      // Case numbers carry an E prefix since the Judiciary's e-filing (2020).
      court: { label: 'Criminal Case No.', example: 'Criminal Case No. E123 of 2026' },
    },
    institutions: {
      dpp: {
        letterhead: ['REPUBLIC OF KENYA', 'OFFICE OF THE DIRECTOR OF PUBLIC PROSECUTIONS', '{office}'],
        name: 'Office of the Director of Public Prosecutions',
        short: 'ODPP',
        head: 'Director of Public Prosecutions',
        headShort: 'DPP',
        headquarters: 'ODPP Headquarters, Nairobi',
        // Grades as advertised by the ODPP; not checked against a current scheme of service.
        ranks: ['Director of Public Prosecutions', 'Senior Assistant Director of Public Prosecutions', 'Assistant Director of Public Prosecutions', 'Principal Prosecution Counsel', 'Senior Prosecution Counsel', 'Prosecution Counsel I', 'Prosecution Counsel II'],
      },
      police: { name: 'National Police Service', headquarters: 'National Police Service Headquarters, Nairobi', ranks: [] },
      prisons: { name: 'Kenya Prisons Service', headquarters: 'Prisons Headquarters, Nairobi', ranks: [] },
    },
    fileSections: { status: 'ready', sections: LETTERED_FILE },
    courts: ["Magistrates' Court", 'High Court', 'Court of Appeal', 'Supreme Court'],
    laws: [
      { title: 'Constitution of Kenya, 2010', cite: null },
      { title: 'Penal Code', cite: 'Cap. 63' },
      { title: 'Criminal Procedure Code', cite: 'Cap. 75' },
      { title: 'Evidence Act', cite: 'Cap. 80' },
      { title: 'Office of the Director of Public Prosecutions Act', cite: 'No. 2 of 2013' },
      { title: 'Sexual Offences Act', cite: 'No. 3 of 2006' },
      { title: 'Children Act', cite: 'No. 29 of 2022' },
      { title: 'National Prosecution Policy', cite: null },
      { title: 'ODPP Decision to Charge Guidelines, 2019', cite: null },
      { title: 'ODPP Diversion Policy, 2019', cite: null },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: BEFORE_COURT,
        hours: 24,
        // Or the end of the next court day when the 24 hours end outside court hours.
        basis: 'Constitution Art. 49(1)(f)',
        source: 'P',
        starts: ['arrest'],
        stops: ['court_production', 'bail', 'release'],
        from: 'latest',
      },
    ],
    decisions: [
      { kind: 'sanction', label: { en: 'Charge', sw: 'Kushtaki', fr: 'Inculper' } },
      { kind: 'threshold_charge', label: { en: 'Charge on the threshold test', sw: 'Kushtaki kwa kigezo cha awali', fr: 'Inculper selon le critère du seuil' } },
      { kind: 'decline', label: { en: 'No further action', sw: 'Hakuna hatua zaidi', fr: 'Pas de suite' } },
      { kind: 'divert', label: { en: 'Divert (Diversion Policy)', sw: 'Kuelekeza nje ya mahakama', fr: 'Déjudiciarisation' } },
      { kind: 'return_for_investigation', label: { en: 'Further investigation', sw: 'Upelelezi zaidi', fr: "Complément d'enquête" } },
      { kind: 'plea_bargain_accepted', label: { en: 'Plea agreement (CPC s.137A)', sw: 'Makubaliano ya kukiri (CPC k.137A)', fr: 'Accord de plaidoyer (CPC s.137A)' } },
      { kind: 'take_over', label: { en: 'Take over the prosecution (Art. 157(6)(b))', sw: 'Kuchukua mashtaka (Ib. 157(6)(b))', fr: 'Reprendre les poursuites (art. 157(6)(b))' } },
      { kind: 'discontinue', label: { en: 'Discontinue, with the court’s permission (Art. 157(6)(c))', sw: 'Kusitisha kwa ruhusa ya mahakama (Ib. 157(6)(c))', fr: "Abandon avec l'accord du tribunal (art. 157(6)(c))" } },
      { kind: 'nolle_prosequi', label: { en: 'Nolle prosequi (CPC s.82)', sw: 'Nolle prosequi (CPC k.82)', fr: 'Nolle prosequi (CPC s.82)' } },
      { kind: 'amend_charge', label: { en: 'Amend the charge', sw: 'Kurekebisha shtaka', fr: "Modifier l'accusation" } },
    ],
  },
  {
    code: 'tz',
    name: { en: 'Tanzania', sw: 'Tanzania', fr: 'Tanzanie' },
    area: 'east_africa',
    status: 'provisional',
    languages: ['sw', 'en'],
    defaultLanguage: 'sw',
    regionLabel: region,
    // The 26 regions of Tanzania Mainland. Zanzibar has its own DPP and is not
    // served by the National Prosecutions Service.
    regions: ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga'],
    references: {
      police: { label: 'RB / IR number', example: null },
      prosecution: { label: 'NPS file number', example: null },
      court: { label: 'Criminal Case No.', example: 'Criminal Case No. 123 of 2026' },
    },
    institutions: {
      dpp: {
        letterhead: ['JAMHURI YA MUUNGANO WA TANZANIA', 'OFISI YA TAIFA YA MASHTAKA', '{OFFICE}'],
        name: 'National Prosecutions Service (Ofisi ya Taifa ya Mashtaka)',
        short: 'NPS',
        head: 'Director of Public Prosecutions',
        headShort: 'DPP',
        headquarters: 'NPS Headquarters, Dodoma',
        // Prosecutors are State Attorneys (CPA s.2, "public prosecutor"); grades not confirmed.
        ranks: ['Director of Public Prosecutions', 'Deputy Director of Public Prosecutions', 'Assistant Director', 'Principal State Attorney', 'Senior State Attorney', 'State Attorney'],
      },
      police: { name: 'Tanzania Police Force', headquarters: 'Police Headquarters, Dodoma', ranks: [] },
      prisons: { name: 'Tanzania Prisons Service', headquarters: 'Prisons Headquarters, Dodoma', ranks: [] },
    },
    fileSections: { status: 'provisional', sections: LETTERED_FILE },
    courts: ['Primary Court', 'District Court', "Court of Resident Magistrate", 'High Court', 'Court of Appeal'],
    laws: [
      { title: 'Constitution of the United Republic of Tanzania, 1977', cite: null },
      { title: 'Penal Code', cite: 'Cap. 16' },
      { title: 'Criminal Procedure Act', cite: 'Cap. 20' },
      { title: 'Evidence Act', cite: 'Cap. 6' },
      { title: 'National Prosecutions Service Act', cite: 'Cap. 430' },
      { title: "Magistrates' Courts Act", cite: 'Cap. 11' },
      { title: 'Economic and Organised Crime Control Act', cite: 'Cap. 200' },
      { title: 'Law of the Child Act', cite: 'Cap. 13' },
    ],
    // Criminal Procedure Act, read at TanzLII (text as at 30 November 2019).
    timeLimits: [
      {
        id: 'police_custody',
        label: { en: 'Before a court, or bond', sw: 'Kufikishwa mahakamani, au dhamana ya polisi', fr: 'Présentation au tribunal ou caution' },
        hours: 24,
        basis: 'Criminal Procedure Act s.32(1)',
        source: 'P',
        starts: ['arrest'],
        stops: ['court_production', 'remand', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'remand_adjournment',
        label: { en: 'Each remand to prison', sw: 'Kila rumande gerezani', fr: 'Chaque renvoi en détention' },
        hours: 15 * 24,
        basis: 'Criminal Procedure Act s.225(2)',
        source: 'P',
        starts: ['remand'],
        stops: ['court_production', 'bail', 'release', 'trial_start'],
        from: 'latest',
      },
      {
        id: 'remand_total',
        label: { en: 'Adjournments in all (First Schedule offences, unless certified)', sw: 'Jumla ya kuahirisha (makosa ya Jedwali la Kwanza, bila hati)', fr: 'Renvois au total (infractions de la première annexe, sans certificat)' },
        hours: 60 * 24,
        basis: 'Criminal Procedure Act s.225(4)',
        source: 'P',
        starts: ['remand'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
    ],
    decisions: [
      { kind: 'sanction', label: { en: 'Charge', sw: 'Kufungua mashtaka', fr: 'Inculper' } },
      { kind: 'decline', label: { en: 'No charge', sw: 'Hakuna mashtaka', fr: 'Pas de poursuites' } },
      { kind: 'return_for_investigation', label: { en: 'Back to the police for more investigation', sw: 'Kurudisha polisi kwa upelelezi zaidi', fr: 'Renvoi à la police pour complément' } },
      { kind: 'plea_bargain_accepted', label: { en: 'Plea agreement (CPA s.194A)', sw: 'Makubaliano ya kukiri kosa (CPA k.194A)', fr: 'Accord de plaidoyer (CPA s.194A)' } },
      { kind: 'nolle_prosequi', label: { en: 'Nolle prosequi (CPA s.91)', sw: 'Nolle prosequi (CPA k.91)', fr: 'Nolle prosequi (CPA s.91)' } },
      { kind: 'take_over', label: { en: 'Take over the prosecution', sw: 'Kuchukua mashtaka', fr: 'Reprendre les poursuites' } },
      { kind: 'amend_charge', label: { en: 'Amend the charge', sw: 'Kurekebisha hati ya mashtaka', fr: "Modifier l'accusation" } },
    ],
  },
  {
    code: 'rw',
    name: { en: 'Rwanda', sw: 'Rwanda', fr: 'Rwanda' },
    area: 'east_africa',
    status: 'provisional',
    languages: ['en', 'fr', 'sw'],
    defaultLanguage: 'en',
    regionLabel: { en: 'Province', sw: 'Jimbo', fr: 'Province' },
    regions: ['City of Kigali', 'Eastern', 'Northern', 'Southern', 'Western'],
    references: {
      police: { label: 'RIB file number', example: null },
      prosecution: { label: 'NPPA file number', example: null },
      court: { label: 'Case number (IECMS)', example: null },
    },
    institutions: {
      dpp: {
        letterhead: ['REPUBLIC OF RWANDA', 'NATIONAL PUBLIC PROSECUTION AUTHORITY', '{OFFICE}'],
        name: 'National Public Prosecution Authority',
        short: 'NPPA',
        head: 'Prosecutor General',
        headShort: 'PG',
        headquarters: 'NPPA Headquarters, Kigali',
        // Prosecutors sit at the level of the court they appear before; titles not confirmed.
        ranks: ['Prosecutor General', 'Deputy Prosecutor General', 'National Prosecutor', 'Intermediate Prosecutor', 'Primary Prosecutor'],
      },
      police: { name: 'Rwanda Investigation Bureau', headquarters: 'RIB Headquarters, Kigali', ranks: [] },
      prisons: { name: 'Rwanda Correctional Service', headquarters: 'RCS Headquarters, Kigali', ranks: [] },
    },
    fileSections: null,
    courts: ['Primary Court', 'Intermediate Court', 'High Court', 'Court of Appeal', 'Supreme Court'],
    laws: [
      { title: 'Constitution of the Republic of Rwanda, 2003, revised in 2015', cite: null },
      { title: 'Law determining offences and penalties in general', cite: 'Law n° 68/2018 of 30/08/2018' },
      { title: 'Law relating to the criminal procedure', cite: 'Law n° 027/2019 of 19/09/2019' },
      { title: 'Law determining the jurisdiction of courts', cite: 'Law n° 30/2018 of 02/06/2018' },
    ],
    // Law n° 027/2019, read in the Official Gazette (special, 08/11/2019).
    timeLimits: [
      {
        id: 'police_custody',
        label: { en: 'Held by the investigator', sw: 'Kizuizi cha mpelelezi', fr: "Détention par l'officier de police judiciaire" },
        hours: 5 * 24,
        basis: 'Law 027/2019 Art. 66',
        source: 'P',
        starts: ['arrest'],
        stops: ['map', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'map',
        label: { en: "Prosecutor's provisional arrest warrant", sw: 'Hati ya muda ya mwendesha mashtaka', fr: "Mandat d'arrêt provisoire" },
        hours: 5 * 24,
        basis: 'Law 027/2019 Art. 35',
        source: 'P',
        starts: ['map'],
        stops: ['odp', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'odp',
        label: { en: 'Provisional detention order', sw: 'Amri ya kizuizi cha muda', fr: 'Ordonnance de détention provisoire' },
        hours: 30 * 24,
        basis: 'Law 027/2019 Art. 79',
        source: 'P',
        starts: ['odp', 'odp_extension'],
        stops: ['odp_extension', 'bail', 'release', 'trial_start'],
        from: 'latest',
      },
      {
        id: 'detention_misdemeanour',
        label: { en: 'Longest detention, misdemeanour', sw: 'Kizuizi kirefu zaidi, kosa la kati', fr: 'Durée maximale, délit' },
        hours: 90 * 24,
        basis: 'Law 027/2019 Art. 79 (three months)',
        source: 'P',
        starts: ['odp'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
      {
        id: 'detention_felony',
        label: { en: 'Longest detention, felony', sw: 'Kizuizi kirefu zaidi, kosa kubwa', fr: 'Durée maximale, crime' },
        hours: 180 * 24,
        basis: 'Law 027/2019 Art. 79 (six months)',
        source: 'P',
        starts: ['odp'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
    ],
    // What the prosecutor may do on receiving the file (Law 027/2019 Art. 24-26).
    decisions: [
      { kind: 'sanction', label: { en: 'File the case in court', sw: 'Kufungua kesi mahakamani', fr: 'Saisir la juridiction' } },
      { kind: 'return_for_investigation', label: { en: 'Further investigation', sw: 'Upelelezi zaidi', fr: 'Instruction supplémentaire' } },
      { kind: 'divert', label: { en: 'Mediation, or a fine without trial', sw: 'Upatanishi, au faini bila kesi', fr: 'Médiation ou amende transactionnelle' } },
      { kind: 'plea_bargain_accepted', label: { en: 'Plea bargain', sw: 'Makubaliano ya kukiri kosa', fr: 'Plaidoyer de culpabilité négocié' } },
      { kind: 'decline', label: { en: 'Close the file', sw: 'Kufunga jalada', fr: 'Classement sans suite' } },
      { kind: 'amend_charge', label: { en: 'Change the charge', sw: 'Kubadilisha shtaka', fr: 'Requalification' } },
    ],
  },
  {
    code: 'bi',
    name: { en: 'Burundi', sw: 'Burundi', fr: 'Burundi' },
    area: 'east_africa',
    // Detention limits from secondary sources (the 2018 code could not be
    // opened here); numbering and ranks follow the shared parquet practice.
    status: 'provisional',
    languages: ['fr', 'sw', 'en'],
    defaultLanguage: 'fr',
    regionLabel: { en: 'Province', sw: 'Jimbo', fr: 'Province' },
    // The five provinces from 2025 (Loi organique n°1/05 du 16 mars 2023).
    regions: ['Buhumuza', 'Bujumbura', 'Burunga', 'Butanyerera', 'Gitega'],
    references: {
      police: { label: 'PV (OPJ)', example: null },
      prosecution: { label: 'N° RMP', example: null },
      court: { label: 'N° RP', example: null },
    },
    institutions: {
      dpp: {
        letterhead: ['RÉPUBLIQUE DU BURUNDI', 'MINISTÈRE DE LA JUSTICE', 'PARQUET DE LA RÉPUBLIQUE À {OFFICE}'],
        name: 'Parquet de la République',
        short: 'Parquet',
        head: 'Procureur Général de la République',
        headShort: 'PGR',
        headquarters: 'Parquet Général de la République, Bujumbura',
        ranks: ['Procureur Général de la République', "Procureur Général près la Cour d'appel", 'Procureur de la République', 'Substitut du Procureur de la République'],
      },
      police: { name: 'Police nationale du Burundi', headquarters: null, ranks: [] },
      prisons: { name: 'Direction générale des affaires pénitentiaires', headquarters: null, ranks: [] },
    },
    fileSections: null,
    courts: ['Tribunal de résidence', 'Tribunal de grande instance', "Cour d'appel", 'Cour suprême'],
    laws: [
      { title: 'Constitution de la République du Burundi', cite: '7 juin 2018' },
      { title: 'Code pénal', cite: 'Loi n°1/27 du 29 décembre 2017' },
      { title: 'Code de procédure pénale', cite: 'Loi n°1/09 du 11 mai 2018' },
      { title: 'Loi sur les violences basées sur le genre', cite: 'Loi n°1/13 du 22 septembre 2016' },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: { en: 'Police custody (garde à vue)', sw: 'Kizuizi cha polisi', fr: 'Garde à vue' },
        hours: 7 * 24,
        basis: 'Code de procédure pénale 2018 (7 jours francs)',
        source: 'S',
        starts: ['arrest'],
        stops: ['map', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'police_custody_extended',
        label: { en: 'Police custody, if the prosecutor extended it', sw: 'Kizuizi cha polisi kikiongezwa', fr: 'Garde à vue prorogée' },
        hours: 14 * 24,
        basis: 'Code de procédure pénale 2018 (au plus le double)',
        source: 'S',
        starts: ['arrest'],
        stops: ['map', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'map',
        label: { en: 'Before the detention judge', sw: 'Kufikishwa kwa jaji wa kizuizi', fr: 'Comparution devant le juge de la détention' },
        hours: 15 * 24,
        basis: 'Code de procédure pénale 2018, art. 155',
        source: 'S',
        starts: ['map'],
        stops: ['odp', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'odp',
        label: { en: 'Pre-trial detention order, then each month', sw: 'Amri ya kizuizi, kisha kila mwezi', fr: 'Ordonnance de détention préventive, puis chaque mois' },
        hours: 30 * 24,
        basis: 'Code de procédure pénale 2018',
        source: 'S',
        starts: ['odp', 'odp_extension'],
        stops: ['odp_extension', 'bail', 'release', 'trial_start'],
        from: 'latest',
      },
      {
        id: 'detention_max_5y',
        label: { en: 'Longest detention, offence up to 5 years', sw: 'Kizuizi kirefu zaidi, kosa hadi miaka 5', fr: "Durée maximale, peine jusqu'à 5 ans" },
        hours: 365 * 24,
        basis: 'Code de procédure pénale 2018 (un an)',
        source: 'S',
        starts: ['odp'],
        stops: ['bail', 'release', 'trial_start'],
        from: 'first',
      },
    ],
    decisions: [
      { kind: 'sanction', label: { en: 'Send to court (fixation)', sw: 'Kupeleka mahakamani', fr: "Fixation d'audience" } },
      { kind: 'decline', label: { en: 'Close without action', sw: 'Kufunga bila hatua', fr: 'Classement sans suite' } },
      { kind: 'divert', label: { en: 'Settlement fine', sw: 'Faini ya maridhiano', fr: 'Amende transactionnelle' } },
      { kind: 'return_for_investigation', label: { en: 'Back to the police officer for more', sw: 'Kurudisha kwa polisi kwa uchunguzi zaidi', fr: "Renvoi à l'OPJ pour complément d'enquête" } },
      { kind: 'amend_charge', label: { en: 'Change the charge', sw: 'Kubadilisha shtaka', fr: 'Requalification des faits' } },
    ],
  },
  {
    code: 'ss',
    name: { en: 'South Sudan', sw: 'Sudan Kusini', fr: 'Soudan du Sud' },
    area: 'east_africa',
    status: 'provisional',
    languages: ['en'],
    defaultLanguage: 'en',
    regionLabel: { en: 'State', sw: 'Jimbo', fr: 'État' },
    // The ten states and the three administrative areas.
    regions: ['Central Equatoria', 'Eastern Equatoria', 'Western Equatoria', 'Jonglei', 'Lakes', 'Northern Bahr el Ghazal', 'Western Bahr el Ghazal', 'Unity', 'Upper Nile', 'Warrap', 'Abyei Administrative Area', 'Greater Pibor Administrative Area', 'Ruweng Administrative Area'],
    references: { police: { label: 'Police case number', example: null }, prosecution: { label: 'Prosecution file number', example: null }, court: { label: 'Court case number', example: null } },
    institutions: {
      // The head's title is not yet confirmed from a primary source: left out on purpose.
      dpp: { letterhead: ['REPUBLIC OF SOUTH SUDAN', 'MINISTRY OF JUSTICE AND CONSTITUTIONAL AFFAIRS', 'PUBLIC PROSECUTION', '{OFFICE}'], name: 'Public Prosecution, Ministry of Justice and Constitutional Affairs', short: 'Public Prosecution', headquarters: 'Ministry of Justice and Constitutional Affairs, Juba', ranks: [] },
      police: { name: 'South Sudan National Police Service', headquarters: 'Police Headquarters, Juba', ranks: [] },
      prisons: { name: 'National Prisons Service of South Sudan', headquarters: 'Prisons Headquarters, Juba', ranks: [] },
    },
    fileSections: null,
    courts: ['Magistrate Court', 'High Court', 'Court of Appeal', 'Supreme Court'],
    laws: [
      { title: 'Transitional Constitution of the Republic of South Sudan, 2011', cite: null },
      { title: 'Penal Code Act', cite: '2008' },
      { title: 'Code of Criminal Procedure Act', cite: '2008' },
      { title: 'Evidence Act', cite: '2006' },
      { title: 'Child Act', cite: '2008' },
      { title: 'Judiciary Act', cite: '2008' },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: BEFORE_COURT,
        hours: 24,
        basis: 'Code of Criminal Procedure Act, 2008',
        source: 'S',
        starts: ['arrest'],
        stops: ['court_production', 'bail', 'release'],
        from: 'latest',
      },
    ],
    decisions: null,
  },
  {
    code: 'cd',
    name: { en: 'DR Congo', sw: 'Kongo (DRC)', fr: 'RD Congo' },
    area: 'east_africa',
    // Numbering, registers, ranks and detention steps from practitioner
    // sources (parquets de grande instance, Kinshasa); nothing confirmed by
    // a serving magistrate yet.
    status: 'provisional',
    languages: ['fr', 'sw'],
    defaultLanguage: 'fr',
    regionLabel: { en: 'Province', sw: 'Jimbo', fr: 'Province' },
    // The 26 provinces (Constitution of 18 February 2006, art. 2).
    regions: ['Bas-Uele', 'Équateur', 'Haut-Katanga', 'Haut-Lomami', 'Haut-Uele', 'Ituri', 'Kasaï', 'Kasaï-Central', 'Kasaï-Oriental', 'Kinshasa', 'Kongo-Central', 'Kwango', 'Kwilu', 'Lomami', 'Lualaba', 'Mai-Ndombe', 'Maniema', 'Mongala', 'Nord-Kivu', 'Nord-Ubangi', 'Sankuru', 'Sud-Kivu', 'Sud-Ubangi', 'Tanganyika', 'Tshopo', 'Tshuapa'],
    references: {
      police: { label: 'PV (OPJ)', example: null },
      // Registre du Ministère Public: every criminal file the parquet opens.
      prosecution: { label: 'N° RMP', example: 'RMP 22503/PR022/MAK' },
      // Rôle pénal of the tribunal.
      court: { label: 'N° RP', example: null },
    },
    institutions: {
      dpp: {
        letterhead: ["RÉPUBLIQUE DÉMOCRATIQUE DU CONGO", "MINISTÈRE DE LA JUSTICE", "PARQUET PRÈS LE TRIBUNAL DE GRANDE INSTANCE DE {OFFICE}"],
        name: 'Parquet près le Tribunal de grande instance',
        short: 'Parquet',
        head: 'Procureur Général près la Cour de cassation',
        headShort: 'PG',
        headquarters: 'Parquet général près la Cour de cassation, Kinshasa',
        ranks: ['Procureur général', 'Avocat général', 'Procureur de la République', 'Premier substitut du Procureur de la République', 'Substitut du Procureur de la République'],
      },
      police: { name: 'Police nationale congolaise', headquarters: 'Commissariat général, Kinshasa', ranks: [] },
      prisons: { name: 'Administration pénitentiaire', headquarters: 'Ministère de la Justice, Kinshasa', ranks: [] },
    },
    // The order a dossier répressif is kept in at the parquet: how the case
    // came in, the OPJ's minutes, the hearings, detention, exhibits, then
    // the magistrate's acts and closing note.
    fileSections: {
      status: 'provisional',
      sections: [
        { code: '1', title: { en: 'Complaint and referral', sw: 'Malalamiko na rufaa', fr: 'Plainte et saisine' }, kinds: ['complaint'] },
        { code: '2', title: { en: "Police officer's reports (PV)", sw: 'Ripoti za polisi (PV)', fr: "Procès-verbaux de l'OPJ" }, kinds: ['initial_report', 'io_report', 'investigation_diary'] },
        { code: '3', title: { en: 'Hearings: complainant and witnesses', sw: 'Mahojiano: mlalamikaji na mashahidi', fr: "PV d'audition : plaignant et témoins" }, kinds: ['witness_statement'] },
        { code: '4', title: { en: 'Questioning of the accused', sw: 'Mahojiano ya mshtakiwa', fr: 'Interrogatoire du prévenu' }, kinds: ['accused_statement'] },
        { code: '5', title: { en: 'Detention (MAP, ODP, extensions)', sw: 'Kizuizini (MAP, ODP, nyongeza)', fr: 'Détention (MAP, ODP, prorogations)' }, kinds: ['detention'] },
        { code: '6', title: { en: 'Seizures and exhibits', sw: 'Vitu vilivyokamatwa na vielelezo', fr: 'Saisies et pièces à conviction' }, kinds: ['exhibit', 'lists'] },
        { code: '7', title: { en: 'Expert and medical reports', sw: 'Ripoti za wataalamu na za matibabu', fr: "Rapports d'expertise et certificats médicaux" }, kinds: ['expert_report', 'medical_report'] },
        { code: '8', title: { en: "Magistrate's acts and orders", sw: 'Hatua na amri za hakimu', fr: 'Actes et ordonnances du magistrat' }, kinds: ['charge_sheet', 'minute', 'court_record'] },
        { code: '9', title: { en: 'Correspondence', sw: 'Mawasiliano', fr: 'Correspondance' }, kinds: ['correspondence', 'other'] },
        { code: '10', title: { en: 'Closing note and decision', sw: 'Taarifa ya mwisho na uamuzi', fr: "Note de fin d'instruction et décision" }, kinds: ['decision'] },
      ],
    },
    courts: ['Tribunal de paix', 'Tribunal de grande instance', "Cour d'appel", 'Cour de cassation'],
    laws: [
      { title: 'Constitution du 18 février 2006', cite: null },
      { title: 'Code pénal congolais', cite: 'Décret du 30 janvier 1940, tel que modifié' },
      { title: 'Code de procédure pénale', cite: 'Décret du 6 août 1959, tel que modifié' },
      { title: "Loi organique portant organisation, fonctionnement et compétences des juridictions de l'ordre judiciaire", cite: 'Loi organique n° 13/011-B du 11 avril 2013' },
      { title: "Loi portant protection de l'enfant", cite: 'Loi n° 09/001 du 10 janvier 2009' },
      { title: 'Loi sur les violences sexuelles', cite: 'Loi n° 06/018 du 20 juillet 2006' },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: { en: 'Police custody (garde à vue)', sw: 'Kizuizi cha polisi (garde à vue)', fr: 'Garde à vue' },
        hours: 48,
        basis: 'Code de procédure pénale',
        source: 'S',
        starts: ['arrest'],
        stops: ['map', 'court_production', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'map',
        label: { en: 'Provisional arrest warrant (MAP)', sw: 'Hati ya kukamatwa ya muda (MAP)', fr: "Mandat d'arrêt provisoire (MAP)" },
        hours: 5 * 24,
        basis: 'Code de procédure pénale',
        source: 'S',
        starts: ['map'],
        stops: ['odp', 'bail', 'release'],
        from: 'latest',
      },
      {
        id: 'odp',
        label: { en: 'Pre-trial detention order (ODP)', sw: 'Amri ya kizuizi kabla ya kesi (ODP)', fr: 'Ordonnance de détention préventive (ODP)' },
        hours: 15 * 24,
        basis: 'Code de procédure pénale',
        source: 'S',
        starts: ['odp'],
        stops: ['odp_extension', 'bail', 'release', 'trial_start'],
        from: 'latest',
      },
      {
        id: 'odp_extension',
        label: { en: 'Each extension of detention', sw: 'Kila nyongeza ya kizuizi', fr: 'Chaque prorogation' },
        hours: 30 * 24,
        basis: 'Code de procédure pénale',
        source: 'S',
        starts: ['odp_extension'],
        stops: ['odp_extension', 'bail', 'release', 'trial_start'],
        from: 'latest',
      },
    ],
    decisions: [
      { kind: 'sanction', label: { en: 'Send to court (fixation)', sw: 'Kupeleka mahakamani (fixation)', fr: "Fixation d'audience" } },
      { kind: 'decline', label: { en: 'Close without action', sw: 'Kufunga bila hatua', fr: 'Classement sans suite' } },
      { kind: 'divert', label: { en: 'Settlement fine', sw: 'Faini ya maridhiano', fr: 'Amende transactionnelle' } },
      { kind: 'return_for_investigation', label: { en: 'Back to the police officer for more', sw: 'Kurudisha kwa polisi kwa uchunguzi zaidi', fr: "Renvoi à l'OPJ pour complément d'enquête" } },
      { kind: 'amend_charge', label: { en: 'Change the charge', sw: 'Kubadilisha shtaka', fr: 'Requalification des faits' } },
    ],
  },
  {
    code: 'so',
    name: { en: 'Somalia', sw: 'Somalia', fr: 'Somalie' },
    area: 'east_africa',
    status: 'provisional',
    languages: ['en'],
    defaultLanguage: 'en',
    regionLabel: { en: 'Federal member state', sw: 'Jimbo la shirikisho', fr: 'État membre fédéré' },
    // The federal member states and Banadir (Mogadishu). Somaliland runs its
    // own prosecution service and is not listed.
    regions: ['Banadir', 'Galmudug', 'Hirshabelle', 'Jubaland', 'Puntland', 'South West'],
    references: { police: { label: 'Police case number', example: null }, prosecution: { label: 'Prosecution file number', example: null }, court: { label: 'Court case number', example: null } },
    institutions: {
      dpp: { letterhead: ['FEDERAL REPUBLIC OF SOMALIA', "ATTORNEY GENERAL'S OFFICE", '{OFFICE}'], name: "Attorney General's Office", short: 'AGO', head: 'Attorney General', headShort: 'AG', headquarters: "Attorney General's Office, Mogadishu", ranks: [] },
      police: { name: 'Somali Police Force', headquarters: 'Police Headquarters, Mogadishu', ranks: [] },
      prisons: { name: 'Somali Custodial Corps', headquarters: null, ranks: [] },
    },
    fileSections: null,
    // Organisation of the Judiciary Law, 1962 (not read here).
    courts: ['District Court', 'Regional Court', 'Court of Appeal', 'Supreme Court'],
    laws: [
      { title: 'Provisional Constitution of the Federal Republic of Somalia, 2012', cite: null },
      { title: 'Penal Code', cite: 'Legislative Decree No. 5 of 16 December 1962' },
      { title: 'Criminal Procedure Code', cite: 'Legislative Decree No. 1 of 1 June 1963' },
    ],
    timeLimits: [
      {
        id: 'police_custody',
        label: BEFORE_COURT,
        hours: 48,
        basis: 'Provisional Constitution Art. 35(5)',
        source: 'P',
        starts: ['arrest'],
        stops: ['court_production', 'bail', 'release'],
        from: 'latest',
      },
    ],
    decisions: null,
  },
]

const rank: Record<PackStatus, number> = { research: 0, provisional: 1, ready: 2 }

/** How far a country can be relied on, as shown to people: never more than
 * its least certain part. A country whose file order is still provisional is
 * not "ready", whatever its numbering says. */
export function countryReadiness(c: Country): PackStatus {
  const parts: PackStatus[] = [c.status, c.fileSections?.status ?? 'research']
  return parts.reduce((a, b) => (rank[b] < rank[a] ? b : a))
}

/** Which section of this country's file a kind of document sits in. A
 * country without a known file order has none: the index then groups by kind. */
export function sectionFor(c: Country | undefined, kind: string): FileSection | undefined {
  return c?.fileSections?.sections.find((s) => (s.kinds as readonly string[]).includes(kind))
}

/** The prosecution service's names in a country, with plain fallbacks for a
 * country whose names are not yet confirmed. */
export function prosecutionNames(c: Country | undefined) {
  const dpp = c?.institutions.dpp
  return {
    name: dpp?.name ?? 'Prosecution service',
    short: dpp?.short ?? dpp?.name ?? 'Prosecution',
    head: dpp?.head ?? 'Head of the prosecution service',
    headShort: dpp?.headShort ?? dpp?.head ?? 'Head',
    rankExample: dpp?.ranks.length ? dpp.ranks[Math.min(5, dpp.ranks.length - 1)] : null,
    letterhead: dpp?.letterhead ?? ['{office}'],
  }
}

export function findCountry(code: string | null | undefined): Country | undefined {
  return COUNTRIES.find((c) => c.code === code)
}
