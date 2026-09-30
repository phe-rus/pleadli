import type { Country } from '@pleadli/setup'
import { kenyaTemplates, somaliaTemplates, southSudanTemplates, tanzaniaTemplates } from './commonlaw'
import { burundiTemplates, congoTemplates } from './parquet'
import { rwandaTemplates } from './rw'
import { genericTemplates } from './generic'
import type { Template, TemplateContext } from './types'
import { ugandaTemplates } from './ug'

export type { Template, TemplateContext } from './types'
export { templateContext } from './context'

/** The document templates of a country; the general set until it has its own. */
export function templatesFor(country: Country | undefined): Template[] {
  switch (country?.code) {
    case 'ug':
      return ugandaTemplates
    case 'cd':
      return congoTemplates
    case 'bi':
      return burundiTemplates
    case 'ke':
      return kenyaTemplates
    case 'tz':
      return tanzaniaTemplates
    case 'rw':
      return rwandaTemplates
    case 'ss':
      return southSudanTemplates
    case 'so':
      return somaliaTemplates
    default:
      return genericTemplates
  }
}

/** The templates a decision calls for, first; the ones that stand alone after. */
export function templatesForDecision(country: Country | undefined, decisionKind: string | null) {
  const all = templatesFor(country)
  return {
    primary: all.filter((t) => decisionKind && (t.forDecisions as readonly string[]).includes(decisionKind)),
    others: all.filter((t) => !decisionKind || !(t.forDecisions as readonly string[]).includes(decisionKind)),
  }
}

/** A document's full content from a template: the letterhead in the
 * country's words, the office, the title and the blocks. */
export function buildContent(template: Template, ctx: TemplateContext) {
  const office = ctx.office.name
  const letterhead = ctx.names.letterhead.map((line) => line.replace('{office}', office).replace('{OFFICE}', (ctx.office.region ?? office).toUpperCase()))
  return {
    office: `${ctx.names.name}${office ? `, ${office}` : ''}`,
    title: template.title,
    blocks: template.build(ctx),
    letterhead,
    lang: template.lang,
  }
}
