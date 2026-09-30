import { findCountry, prosecutionNames, type Country } from '@pleadli/setup'
import { getLocale } from '@/paraglide/runtime'

/**
 * The country this office works under, for code that is not a component
 * (labels worked out in a plain function). The app gate sets it from the
 * installation before any route renders; components can also use
 * `useJurisdiction()` from features/installation.
 */
let active: Country | undefined

export function setActiveJurisdiction(code: string | null | undefined) {
  active = findCountry(code)
}

export function activeJurisdiction(): Country | undefined {
  return active
}

/** A pack text in the reader's language. */
export function packText(text: Record<string, string>): string {
  return text[getLocale()] ?? text.en
}

type ReferenceKind = 'police' | 'prosecution' | 'court'

/** A reference number's name as the country's own officers write it (a term
 * of art, never translated: "N° RMP", "OB / CR"). The app's general wording
 * only when no country is set. */
export function referenceLabel(kind: ReferenceKind, fallback: () => string): string {
  return active?.references[kind].label ?? fallback()
}

/** A real example of the number, to show as a placeholder. */
export function referenceExample(kind: ReferenceKind, fallback: () => string): string {
  return active?.references[kind].example ?? fallback()
}

/** The prosecution service's own names here: what it is called, its short
 * name, its head's title. Never "DPP" where the country says otherwise. */
export function serviceNames() {
  return prosecutionNames(active)
}

/** The product as this office knows it: "Pleadli · ODPP", "Pleadli · Parquet". */
export function productName() {
  return active ? `Pleadli · ${prosecutionNames(active).short}` : 'Pleadli'
}
