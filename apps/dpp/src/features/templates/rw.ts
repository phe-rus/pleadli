import type { Block } from '@/features/documents/schema'
import type { Template, TemplateContext } from './types'

/**
 * Rwanda (English). The prosecutor's acts under Law n° 027/2019 relating to
 * the criminal procedure, read in the Official Gazette: filing the case in
 * court and the other options on receiving the file (Art. 24), a fine
 * without trial (Art. 25), the file for provisional detention (Art. 74) and
 * its renewal (Art. 79). Drafts for the prosecutor to edit; the NPPA's own
 * forms have not been seen.
 */

const DASH = '....................'
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const suspects = (ctx: TemplateContext) => (ctx.accused.length ? ctx.accused.join(', ') : DASH)
const offences = (ctx: TemplateContext) => (ctx.charges.length ? ctx.charges.map((c) => `${c.offence}${c.section ? ` (${c.section})` : ''}`).join('; ') : DASH)
const last = (ctx: TemplateContext, kind: string) => [...ctx.custody].reverse().find((e) => e.kind === kind)

function refs(ctx: TemplateContext): Block {
  return {
    type: 'fields',
    rows: [
      { label: 'NPPA file number', value: ctx.file.odppRegistrationNumber ?? DASH },
      { label: 'RIB file number', value: ctx.file.policeReference ?? DASH },
      { label: 'RIB station', value: ctx.file.policeStation ?? DASH },
    ],
  }
}

const sign = (ctx: TemplateContext, label = 'Prosecutor'): Block[] => [
  { type: 'paragraph', text: `Done at ${ctx.office.name || DASH}, on ${day(ctx.today)}.` },
  { type: 'signature', label, name: `${ctx.signer.name}${ctx.signer.rank ? `, ${ctx.signer.rank}` : ''}`, caption: null },
]

export const rwandaTemplates: Template[] = [
  {
    id: 'case_submission',
    title: 'Submission of the Case to Court',
    about: 'Files the case with the competent court when the file is complete (Art. 24, 1°).',
    lang: 'en',
    forDecisions: ['sanction', 'amend_charge'],
    build: (ctx) => [
      { type: 'paragraph', text: `To the President of the ${DASH} Court of ${ctx.office.region ?? DASH}` },
      refs(ctx),
      { type: 'heading', text: `Prosecution versus ${suspects(ctx)}` },
      ...(ctx.charges.length ? ctx.charges : [{ offence: DASH, section: null, particulars: DASH, accused: null }]).flatMap((c, i): Block[] => [
        { type: 'heading', text: `Offence ${i + 1}` },
        { type: 'fields', rows: [{ label: 'Offence', value: `${c.offence}${c.section ? `, provided for and punished by ${c.section}` : ''}` }] },
        { type: 'paragraph', text: c.particulars ?? DASH },
      ]),
      { type: 'heading', text: 'Facts' },
      { type: 'paragraph', text: ctx.decision?.reasons ?? DASH },
      { type: 'heading', text: 'Evidence' },
      { type: 'list', ordered: true, items: [...ctx.witnesses.map((w) => `Statement of ${w}`), ...ctx.exhibits].map((e) => ({ title: null, text: e })) },
      { type: 'paragraph', text: 'The Prosecution requests the Court to find the accused guilty of the offences above and to impose the penalties provided by law.' },
      ...sign(ctx),
    ],
  },
  {
    id: 'provisional_detention_request',
    title: 'Request for Provisional Detention',
    about: "Asks the court to order provisional detention before the prosecutor's warrant ends (Art. 74).",
    lang: 'en',
    forDecisions: [],
    build: (ctx) => {
      const map = last(ctx, 'map')
      return [
        { type: 'paragraph', text: `To the President of the Primary Court of ${DASH}` },
        refs(ctx),
        { type: 'paragraph', text: `The Prosecution states that ${suspects(ctx)}, suspected of ${offences(ctx)}, is held under a provisional arrest warrant issued on ${map ? when(map.at) : DASH}, valid for five days that cannot be extended (Art. 35).` },
        { type: 'paragraph', text: `There are serious grounds to believe the suspect committed an offence punishable with imprisonment of at least two years (Art. 66), and detention is needed because ${DASH}.` },
        { type: 'paragraph', text: 'The Prosecution requests the Court to order the provisional detention of the suspect for thirty days (Art. 79).' },
        ...sign(ctx),
      ]
    },
  },
  {
    id: 'detention_renewal_request',
    title: 'Request to Renew Provisional Detention',
    about: 'Asks for thirty more days, with what was done in the last thirty (Art. 79).',
    lang: 'en',
    forDecisions: [],
    build: (ctx) => {
      const order = last(ctx, 'odp_extension') ?? last(ctx, 'odp')
      return [
        { type: 'paragraph', text: `To the President of the Primary Court of ${DASH}` },
        refs(ctx),
        { type: 'paragraph', text: `${suspects(ctx)} is held under a provisional detention order of ${order ? day(order.at) : DASH}, which ends thirty days after it was made.` },
        { type: 'heading', text: 'Done in the last thirty days' },
        { type: 'paragraph', text: DASH },
        { type: 'heading', text: 'To be done in the next thirty days' },
        { type: 'paragraph', text: DASH },
        { type: 'paragraph', text: 'The Prosecution requests the Court to renew the provisional detention for thirty days.' },
        ...sign(ctx),
      ]
    },
  },
  {
    id: 'fine_without_trial',
    title: 'Offer of a Fine Without Trial',
    about: 'Offers the suspect a fine in place of a trial; paying it ends the criminal action (Art. 25).',
    lang: 'en',
    forDecisions: ['divert'],
    build: (ctx) => [
      refs(ctx),
      { type: 'paragraph', text: `To ${suspects(ctx)}` },
      { type: 'paragraph', text: `You are prosecuted for ${offences(ctx)}. The Prosecution offers you the choice between being brought before the court and paying a fine without trial of ${DASH} Rwandan francs within ${DASH} days.` },
      { type: 'paragraph', text: 'If you pay the fine, the criminal action against you ends. Paying the fine is not an admission of guilt. The victim will be informed of this decision.' },
      ...sign(ctx),
      { type: 'signature', label: 'Choice of the suspect', name: '', caption: 'Pay the fine / Go to court' },
    ],
  },
  {
    id: 'closure_decision',
    title: 'Decision to Close the File',
    about: 'Closes the file; the victim and the suspect are told within thirty days (Art. 24, 6°).',
    lang: 'en',
    forDecisions: ['decline'],
    build: (ctx) => [
      refs(ctx),
      { type: 'heading', text: ctx.file.title },
      { type: 'paragraph', text: `Reasons: ${ctx.decision?.reasons ?? DASH}` },
      { type: 'paragraph', text: 'The file is closed. This is an administrative measure: the investigation may be reopened if new evidence appears, unless the criminal action is time-barred. The victim and the suspect are informed within thirty days.' },
      ...sign(ctx),
    ],
  },
  {
    id: 'further_investigation',
    title: 'Further Investigation Instructions',
    about: 'What must still be gathered before the file can go to court (Art. 24, 2°).',
    lang: 'en',
    forDecisions: ['return_for_investigation'],
    build: (ctx) => [
      { type: 'fields', rows: [{ label: 'To', value: `The Investigator, ${ctx.file.policeStation ?? 'RIB'}` }, { label: 'Date', value: day(ctx.today) }] },
      refs(ctx),
      { type: 'paragraph', text: 'The evidence on this file is not yet sufficient. Please carry out the following and return the file:' },
      { type: 'list', ordered: true, items: (ctx.directions.length ? ctx.directions : [{ kind: '', instruction: DASH }]).map((d) => ({ title: null, text: d.instruction })) },
      ...sign(ctx),
    ],
  },
]
