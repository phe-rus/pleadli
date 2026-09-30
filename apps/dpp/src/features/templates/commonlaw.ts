import type { Block } from '@/features/documents/schema'
import type { Template, TemplateContext } from './types'

/**
 * Common-law countries without their own set yet (Kenya, Tanzania, South
 * Sudan, Somalia): the same four documents, a charge sheet, directions to
 * Police, reasons for not charging and a release letter, with each country's
 * court, case style, references and service. What a country's law adds of
 * its own (Tanzania's adjournment certificate) is in its `extra`. Drafts for
 * the prosecutor to edit, not gazetted forms.
 */

const DASH = '....................'
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n)

type CommonLaw = {
  /** The court line at the top of a charge sheet. */
  court: (ctx: TemplateContext) => string
  /** The prosecuting party in a case title ("Republic"). */
  party: string
  /** Documents only this country uses. */
  extra?: Template[]
}

const place = (ctx: TemplateContext) => (ctx.office.region ?? ctx.office.name ?? DASH).toUpperCase()

function refs(ctx: TemplateContext, extra: { label: string; value: string }[] = []): Block {
  const r = ctx.country?.references
  return {
    type: 'fields',
    rows: [
      { label: r?.prosecution.label ?? 'Prosecution reference', value: ctx.file.odppRegistrationNumber ?? DASH },
      { label: r?.police.label ?? 'Police reference', value: ctx.file.policeReference ?? DASH },
      { label: 'Police station', value: ctx.file.policeStation ?? DASH },
      ...extra,
    ],
  }
}

const sign = (ctx: TemplateContext, label: string, when = ctx.today): Block => ({
  type: 'signature',
  label,
  name: `${ctx.signer.name}${ctx.signer.rank ? `, ${ctx.signer.rank}` : ''}`,
  caption: `for the ${ctx.names.head}, ${day(when)}`,
})

const accusedList = (ctx: TemplateContext): Block => ({ type: 'list', ordered: true, items: (ctx.accused.length ? ctx.accused : [DASH]).map((a) => ({ title: null, text: a })) })

function commonLawTemplates(c: CommonLaw): Template[] {
  return [
    {
      id: 'charge_sheet',
      title: 'Charge Sheet',
      about: 'The charge as approved, count by count, for filing in court.',
      lang: 'en',
      forDecisions: ['sanction', 'threshold_charge', 'amend_charge'],
      build: (ctx) => [
        { type: 'paragraph', text: c.court(ctx) },
        refs(ctx, [{ label: ctx.country?.references.court.label ?? 'Court case no.', value: ctx.file.courtCaseNumber ?? DASH }]),
        { type: 'heading', text: `${c.party} versus` },
        accusedList(ctx),
        ...(ctx.charges.length ? ctx.charges : [{ offence: DASH, section: null, particulars: DASH, accused: null }]).flatMap((ch, i): Block[] => [
          { type: 'heading', text: `Count ${roman(i + 1)}` },
          { type: 'fields', rows: [{ label: 'Statement of offence', value: `${ch.offence}${ch.section ? `, contrary to ${ch.section}` : ''}` }] },
          { type: 'paragraph', text: `Particulars of offence: ${ch.particulars ?? DASH}` },
        ]),
        sign(ctx, 'Approved by'),
        { type: 'signature', label: 'Received in court by', name: '', caption: 'Magistrate / Clerk' },
      ],
    },
    {
      id: 'directions_to_police',
      title: 'Directions for Further Investigation',
      about: 'What Police must do before the file comes back.',
      lang: 'en',
      forDecisions: ['return_for_investigation'],
      build: (ctx) => [
        { type: 'fields', rows: [{ label: 'To', value: `The Officer in Charge, ${ctx.file.policeStation ?? DASH}` }, { label: 'Date', value: day(ctx.today) }] },
        refs(ctx),
        { type: 'heading', text: `RE: ${ctx.file.title}` },
        { type: 'paragraph', text: 'The above file has been reviewed. The evidence on it is not yet sufficient for a charging decision. It is returned for the following inquiries:' },
        { type: 'list', ordered: true, items: (ctx.directions.length ? ctx.directions : [{ kind: '', instruction: DASH }]).map((d) => ({ title: null, text: d.instruction })) },
        { type: 'paragraph', text: `Please complete these inquiries and resubmit the file to this office within ${DASH} days.` },
        sign(ctx, 'Signed'),
      ],
    },
    {
      id: 'decline_reasons',
      title: 'Reasons for Not Charging',
      about: 'Why the file will not be prosecuted, for the record and for Police.',
      lang: 'en',
      forDecisions: ['decline'],
      build: (ctx) => [
        refs(ctx),
        { type: 'heading', text: ctx.file.title },
        { type: 'paragraph', text: ctx.decision?.reasons ?? DASH },
        { type: 'paragraph', text: 'For these reasons no charge will be preferred on this file. The file is closed and may be reopened if new evidence comes to light.' },
        sign(ctx, 'Decided by', ctx.decision?.decidedAt ?? ctx.today),
      ],
    },
    {
      id: 'release_letter',
      title: 'Letter for Release from Custody',
      about: 'Asks for a suspect to be released when no charge follows or custody is no longer lawful.',
      lang: 'en',
      forDecisions: ['nolle_prosequi', 'discontinue'],
      build: (ctx) => [
        { type: 'fields', rows: [{ label: 'To', value: `The Officer in Charge, ${ctx.file.policeStation ?? DASH}` }, { label: 'Date', value: day(ctx.today) }] },
        refs(ctx),
        { type: 'heading', text: `RE: Release of ${ctx.accused.join(', ') || DASH}` },
        { type: 'paragraph', text: `Please release the above person(s) from custody forthwith, unless held for another lawful cause. Reason: ${ctx.decision?.reasons ?? DASH}` },
        sign(ctx, 'Signed'),
      ],
    },
    ...(c.extra ?? []),
  ]
}

const KENYA: CommonLaw = {
  court: (ctx) => `IN THE CHIEF MAGISTRATE'S COURT AT ${place(ctx)}`,
  party: 'Republic',
}

const TANZANIA: CommonLaw = {
  court: (ctx) => `IN THE DISTRICT COURT OF ${place(ctx)} AT ${DASH}`,
  party: 'Republic',
  extra: [
    {
      id: 'adjournment_certificate',
      title: 'Certificate for Further Adjournment',
      about: 'Filed before the 60 days of adjournments run out, with the need and the grounds (Criminal Procedure Act s.225(4)(b)).',
      lang: 'en',
      forDecisions: [],
      build: (ctx) => {
        const first = ctx.custody.find((e) => e.kind === 'remand')
        return [
          { type: 'paragraph', text: `IN THE DISTRICT COURT OF ${place(ctx)} AT ${DASH}` },
          refs(ctx, [{ label: 'Criminal Case No.', value: ctx.file.courtCaseNumber ?? DASH }]),
          { type: 'heading', text: `Republic versus ${ctx.accused.join(', ') || DASH}` },
          { type: 'paragraph', text: `I, the undersigned State Attorney, certify under section 225(4)(b) of the Criminal Procedure Act that a further adjournment of this case is needed. The accused was first remanded on ${first ? day(first.at) : DASH}.` },
          { type: 'heading', text: 'Grounds' },
          { type: 'paragraph', text: DASH },
          sign(ctx, 'State Attorney'),
        ]
      },
    },
  ],
}

const SOUTH_SUDAN: CommonLaw = {
  court: (ctx) => `IN THE MAGISTRATE COURT AT ${place(ctx)}`,
  party: 'Republic of South Sudan',
}

const SOMALIA: CommonLaw = {
  court: (ctx) => `IN THE DISTRICT COURT OF ${place(ctx)}`,
  party: 'The State',
}

export const kenyaTemplates = commonLawTemplates(KENYA)
export const tanzaniaTemplates = commonLawTemplates(TANZANIA)
export const southSudanTemplates = commonLawTemplates(SOUTH_SUDAN)
export const somaliaTemplates = commonLawTemplates(SOMALIA)
