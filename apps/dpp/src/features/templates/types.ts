import type { Block } from '@/features/documents/schema'
import type { CustodyEvent } from '@/features/custody/data'
import type { ProsecutionFile } from '@/features/prosecution-files/schema'
import type { Country, DecisionKind, Locale, prosecutionNames } from '@pleadli/setup'

/** Everything a template may read, gathered from the file on screen. */
export type TemplateContext = {
  country: Country | undefined
  names: ReturnType<typeof prosecutionNames>
  office: { name: string; region: string | null }
  file: ProsecutionFile
  accused: string[]
  complainants: string[]
  witnesses: string[]
  charges: { offence: string; section: string | null; particulars: string | null; accused: string | null }[]
  decision: { id: string; kind: string; label: string; reasons: string | null; decidedAt: number } | null
  directions: { kind: string; instruction: string }[]
  custody: CustodyEvent[]
  exhibits: string[]
  signer: { name: string; rank: string | null }
  today: number
}

/**
 * A document template of one country: which decisions it follows (none: it
 * stands on the file alone, like a detention request), the language it is
 * written in (the country's official one, whatever the screen's language),
 * and how its blocks are built from the file. The prosecutor edits the
 * result on the page before issuing it.
 */
export type Template = {
  id: string
  title: string
  about: string
  lang: Locale
  forDecisions: readonly DecisionKind[]
  build: (ctx: TemplateContext) => Block[]
}
