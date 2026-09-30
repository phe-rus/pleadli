import type { Block } from '@/features/documents/schema'
import type { Template, TemplateContext } from './types'

/**
 * Uganda (English). Forms follow the ODPP Decision to Charge Guidelines 2023
 * and the Magistrates Courts Act (charge sheet, committal summary), as far as
 * the repo's research confirms them (docs/dpp/RESEARCH.md §6). Wording is a
 * starting draft for the State Attorney to edit, not a gazetted form.
 */

const DASH = '....................'
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n)

function header(ctx: TemplateContext, extra: { label: string; value: string }[] = []): Block {
  return {
    type: 'fields',
    rows: [
      { label: 'ODPP registration no.', value: ctx.file.odppRegistrationNumber ?? DASH },
      { label: 'Police reference', value: ctx.file.policeReference ?? DASH },
      { label: 'Police station', value: ctx.file.policeStation ?? DASH },
      ...extra,
    ],
  }
}

function signature(ctx: TemplateContext, label: string, caption: string): Block {
  return { type: 'signature', label, name: `${ctx.signer.name}${ctx.signer.rank ? `, ${ctx.signer.rank}` : ''}`, caption }
}

export const ugandaTemplates: Template[] = [
  {
    id: 'charge_sheet',
    title: 'Charge Sheet',
    about: 'The charge as sanctioned, count by count, for filing in court.',
    lang: 'en',
    forDecisions: ['sanction', 'threshold_charge', 'amend_charge'],
    build: (ctx) => [
      { type: 'paragraph', text: `IN THE CHIEF MAGISTRATE'S COURT OF ${ctx.office.region?.toUpperCase() ?? DASH} AT ${DASH}` },
      header(ctx, [{ label: 'Court case no.', value: ctx.file.courtCaseNumber ?? DASH }]),
      { type: 'heading', text: 'Uganda versus' },
      { type: 'list', ordered: true, items: (ctx.accused.length ? ctx.accused : [DASH]).map((a) => ({ title: null, text: a })) },
      ...(ctx.charges.length ? ctx.charges : [{ offence: DASH, section: null, particulars: DASH, accused: null }]).flatMap((c, i): Block[] => [
        { type: 'heading', text: `Count ${roman(i + 1)}` },
        { type: 'fields', rows: [{ label: 'Statement of offence', value: `${c.offence}${c.section ? `, contrary to ${c.section}` : ''}` }] },
        { type: 'paragraph', text: `Particulars of offence: ${c.particulars ?? DASH}` },
      ]),
      signature(ctx, 'Sanctioned by', `for the Director of Public Prosecutions, ${day(ctx.today)}`),
      { type: 'signature', label: 'Received in court by', name: '', caption: 'Magistrate / Clerk' },
    ],
  },
  {
    id: 'directions_to_police',
    title: 'Directions on Return for Further Investigation',
    about: 'What Police must do before the file comes back.',
    lang: 'en',
    forDecisions: ['return_for_investigation'],
    build: (ctx) => [
      { type: 'fields', rows: [{ label: 'To', value: `The Officer in Charge, CID, ${ctx.file.policeStation ?? DASH}` }, { label: 'Date', value: day(ctx.today) }] },
      header(ctx),
      { type: 'heading', text: `RE: ${ctx.file.title}` },
      { type: 'paragraph', text: 'The above file has been reviewed. The evidence on it is not yet sufficient to reach a charging decision. It is returned for the following inquiries to be made:' },
      { type: 'list', ordered: true, items: (ctx.directions.length ? ctx.directions : [{ kind: '', instruction: DASH }]).map((d) => ({ title: null, text: d.instruction })) },
      { type: 'paragraph', text: `Please complete these inquiries and resubmit the file to this office within ${DASH} days.` },
      signature(ctx, 'Signed', `for the Director of Public Prosecutions`),
    ],
  },
  {
    id: 'decline_reasons',
    title: 'Written Reasons for Declining to Charge',
    about: 'The reasons the file will not be prosecuted, for the record and for Police.',
    lang: 'en',
    forDecisions: ['decline'],
    build: (ctx) => [
      header(ctx),
      { type: 'heading', text: ctx.file.title },
      { type: 'paragraph', text: ctx.decision?.reasons ?? DASH },
      { type: 'paragraph', text: 'For these reasons no charge will be preferred on this file. The file is closed. It may be reopened if new evidence comes to light.' },
      signature(ctx, 'Decided by', `for the Director of Public Prosecutions, ${day(ctx.decision?.decidedAt ?? ctx.today)}`),
    ],
  },
  {
    id: 'summary_of_case',
    title: 'Summary of the Case',
    about: 'Filed with the indictment on committal to the High Court (Magistrates Courts Act, s. 168).',
    lang: 'en',
    forDecisions: ['committal_venue_high_court'],
    build: (ctx) => [
      header(ctx),
      { type: 'heading', text: `Uganda versus ${ctx.accused.join(', ') || DASH}` },
      { type: 'heading', text: 'Summary of the case' },
      { type: 'paragraph', text: 'Write the facts the prosecution will prove, in numbered paragraphs, with enough particulars to give the accused reasonable information about the offence.' },
      { type: 'heading', text: 'Witnesses' },
      { type: 'list', ordered: true, items: [...ctx.complainants, ...ctx.witnesses].map((w) => ({ title: null, text: w })) },
      { type: 'heading', text: 'Exhibits' },
      { type: 'list', ordered: true, items: (ctx.exhibits.length ? ctx.exhibits : [DASH]).map((e) => ({ title: null, text: e })) },
      signature(ctx, 'Signed', `for the Director of Public Prosecutions, ${day(ctx.today)}`),
    ],
  },
]
