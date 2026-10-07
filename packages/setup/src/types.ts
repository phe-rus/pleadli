/** The languages every Pleadli app ships with. */
export type Locale = 'en' | 'sw' | 'fr'
export const LOCALES: readonly Locale[] = ['en', 'sw', 'fr']

/** What a word looks like in each shipped language. */
export type Text = Record<Locale, string>

export type Institution = 'police' | 'dpp' | 'prisons' | 'courts' | 'lawyers'

/** How far a country's pack has been checked against real sources.
 * - ready: read from primary or well corroborated sources, used in production
 * - provisional: a working default that still needs a practitioner to confirm
 * - research: named, not yet researched; the app works with neutral defaults */
export type PackStatus = 'ready' | 'provisional' | 'research'

/** Office: a station, regional office or prison unit that does the daily work.
 * Headquarters: the national office that oversees the offices. */
export type Model = 'office' | 'headquarters'

/** None: no sign-in, one person on a trusted computer.
 * Basic: everyone signs in with a PIN; the app locks when idle.
 * Full: a password and an authenticator code; everything audited. */
export type Protection = 'none' | 'basic' | 'full'

export type PersonDraft = {
  name: string
  rank: string
  role: string
  /** The app's one yes/no about a person (in DPP: "is the Director"). */
  flag: boolean
  /** PIN or password, per the protection level. Null when nobody signs in. */
  secret: string | null
}

export type SecondFactorEnrolment = {
  secret: string
  uri: string
  /** A QR code of `uri`, as SVG markup made by the app itself. */
  svg: string
}

export type SetupPayload = {
  licenceVersion: string
  jurisdiction: string
  language: Locale
  model: Model
  officeName: string
  region: string | null
  protection: Protection
  accent: string
  /** A data URL, or null for the default crest. */
  logo: string | null
  administrator: PersonDraft & { secondFactor: { secret: string; code: string } | null }
  people: PersonDraft[]
  /** An app's own answers from the steps it adds (see `ExtraStep`). */
  extra?: Record<string, unknown>
}

/** The administrator the app already knows from before setup existed. */
export type ExistingPerson = { name: string; rank: string | null; flag: boolean }
