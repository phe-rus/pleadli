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
const firstParagraph = (text: string) => text.split(/\n\n/)[0].trim()
const firstSentence = (text: string) => (text.match(/^.*?[.!?](\s|$)/)?.[0] ?? text).trim()
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
    id: 'indictment',
    title: 'Indictment',
    about: 'The charge for trial in the High Court, in the name of the Director of Public Prosecutions (Trial on Indictments Act, ss. 23, 24, 27, 28).',
    lang: 'en',
    forDecisions: ['committal_venue_high_court', 'sanction'],
    build: (ctx) => {
      const accused = ctx.accused.length ? ctx.accused : [DASH]
      const charges = ctx.charges.length ? ctx.charges : [{ offence: DASH, section: null, particulars: DASH, accused: null }]
      const arising = [ctx.file.courtCaseNumber, ctx.file.policeReference].filter(Boolean).join('; ')
      return [
        { type: 'heading', text: `In the High Court of Uganda at ${DASH}` },
        { type: 'heading', text: `Criminal Session Case No. ${DASH} of ${new Date(ctx.today).getFullYear()}` },
        ...(arising ? [{ type: 'note', text: `Arising from ${arising}` } as Block] : []),
        { type: 'heading', text: `Uganda versus ${accused.join(', ')}` },
        // s.28(1): the commencement, with the blanks the registry fills.
        { type: 'paragraph', text: `In the High Court of Uganda at ${DASH} the ${DASH} day of ${DASH}, 20..., at the sessions held at ${DASH}, the court is informed by the Director of Public Prosecutions that ${accused.join(', ')} ${accused.length > 1 ? 'are' : 'is'} charged with the following ${charges.length > 1 ? 'offences' : 'offence'}:` },
        // s.24(2): more than one offence, each in its own count.
        ...charges.flatMap((c, i): Block[] => [
          ...(charges.length > 1 ? [{ type: 'heading', text: `Count ${roman(i + 1)}` } as Block] : []),
          { type: 'fields', rows: [{ label: 'Statement of offence', value: `${c.offence}${c.section ? `, contrary to ${c.section}` : ''}` }] },
          { type: 'paragraph', text: `Particulars of offence: ${c.particulars ? firstParagraph(c.particulars) : DASH}` },
        ]),
        // s.27: in the name of, and signed for, the Director of Public Prosecutions.
        signature(ctx, `Dated at ${DASH} this ${day(ctx.today)}`, 'for Director of Public Prosecutions'),
      ]
    },
  },
  {
    id: 'summary_of_case',
    title: 'Summary of the Case',
    about: 'Filed with the indictment on committal to the High Court (Magistrates Courts Act, s. 168). Drafted from the statements on the file.',
    lang: 'en',
    forDecisions: ['committal_venue_high_court'],
    build: (ctx) => {
      const accused = ctx.accused.join(', ') || DASH
      const charge = ctx.charges[0]
      let n = 1
      const para = (text: string): Block => ({ type: 'paragraph', text: `${n++}. ${text}` })
      return [
        header(ctx),
        { type: 'heading', text: `Uganda versus ${accused}` },
        { type: 'heading', text: 'Summary of the case' },
        para(charge ? `The accused, ${accused}, is indicted with the offence of ${charge.offence}${charge.section ? ` contrary to ${charge.section}` : ''}. ${charge.particulars ? `The particulars are that ${firstParagraph(charge.particulars)}` : ''}` : `The accused, ${accused}, is indicted with ${DASH}.`),
        // One paragraph per witness, from the words of their statement: the
        // State Attorney shortens them on the page, or asks Assist to.
        ...ctx.statements.map((st, i) => para(`PW${i + 1}, ${st.name} (${st.role.toLowerCase()}), in a statement made on ${day(st.madeOn)}, says: "${st.text.replace(/\n\n/g, ' ') || DASH}"`)),
        ...ctx.evidence.filter((e) => e.description).map((e) => para(`${e.mark ? `${e.mark}: ` : ''}${firstParagraph(e.description)}`)),
        { type: 'heading', text: 'Witnesses' },
        { type: 'list', ordered: false, items: (ctx.statements.length ? ctx.statements.map((st, i) => `PW${i + 1}. ${st.name}, ${st.role.toLowerCase()}`) : [...ctx.complainants, ...ctx.witnesses]).map((w) => ({ title: null, text: w })) },
        { type: 'heading', text: 'Exhibits' },
        { type: 'list', ordered: true, items: [...ctx.evidence.map((e) => `${e.mark ? `${e.mark}, ` : ''}${e.kind.toLowerCase()}: ${firstSentence(e.description) || DASH}`), ...ctx.exhibits].concat(ctx.evidence.length || ctx.exhibits.length ? [] : [DASH]).map((e) => ({ title: null, text: e })) },
        signature(ctx, 'Signed', `for the Director of Public Prosecutions, ${day(ctx.today)}`),
      ]
    },
  },
]
