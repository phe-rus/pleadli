import type { Block } from '@/features/documents/schema'
import type { Template, TemplateContext } from './types'

/**
 * For a country whose own forms are not yet in its pack: plain English
 * documents that follow each decision, worded with that country's own
 * service and head, never another country's.
 */

const DASH = '....................'
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const refs = (ctx: TemplateContext): Block => ({
  type: 'fields',
  rows: [
    { label: 'Prosecution reference', value: ctx.file.odppRegistrationNumber ?? DASH },
    { label: 'Police reference', value: ctx.file.policeReference ?? DASH },
    { label: 'Police station', value: ctx.file.policeStation ?? DASH },
  ],
})

const sign = (ctx: TemplateContext, label: string): Block => ({
  type: 'signature',
  label,
  name: `${ctx.signer.name}${ctx.signer.rank ? `, ${ctx.signer.rank}` : ''}`,
  caption: `for the ${ctx.names.head}, ${day(ctx.today)}`,
})

export const genericTemplates: Template[] = [
  {
    id: 'charge_sheet',
    title: 'Charge Sheet',
    about: 'The charge as decided, count by count.',
    lang: 'en',
    forDecisions: ['sanction', 'threshold_charge', 'amend_charge'],
    build: (ctx) => [
      refs(ctx),
      { type: 'heading', text: `${ctx.country?.name.en ?? 'The State'} versus ${ctx.accused.join(', ') || DASH}` },
      ...(ctx.charges.length ? ctx.charges : [{ offence: DASH, section: null, particulars: DASH, accused: null }]).flatMap((c, i): Block[] => [
        { type: 'heading', text: `Count ${i + 1}` },
        { type: 'paragraph', text: `${c.offence}${c.section ? `, contrary to ${c.section}` : ''}. ${c.particulars ?? ''}` },
      ]),
      sign(ctx, 'Approved by'),
    ],
  },
  {
    id: 'directions_to_police',
    title: 'Directions to Police',
    about: 'What Police must do before the file comes back.',
    lang: 'en',
    forDecisions: ['return_for_investigation'],
    build: (ctx) => [
      refs(ctx),
      { type: 'heading', text: `RE: ${ctx.file.title}` },
      { type: 'paragraph', text: 'The file is returned for the following inquiries:' },
      { type: 'list', ordered: true, items: (ctx.directions.length ? ctx.directions : [{ kind: '', instruction: DASH }]).map((d) => ({ title: null, text: d.instruction })) },
      sign(ctx, 'Signed'),
    ],
  },
  {
    id: 'decline_reasons',
    title: 'Reasons for Not Prosecuting',
    about: 'Why the file will not be prosecuted.',
    lang: 'en',
    forDecisions: ['decline'],
    build: (ctx) => [refs(ctx), { type: 'heading', text: ctx.file.title }, { type: 'paragraph', text: ctx.decision?.reasons ?? DASH }, sign(ctx, 'Decided by')],
  },
]
