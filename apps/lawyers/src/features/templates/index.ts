import * as m from '@/paraglide/messages'

/** Templates that start a document, per kind of matter
 * (docs/lawyers/REVIEW-2026-09-30.md, L3). The text is the court's language as
 * a practice in Uganda files it (English). Two follow a prescribed form that
 * was read: the notice of intention to sue Government (its contents are those
 * the Civil Procedure and Limitation (Miscellaneous Provisions) Act s.2(1)
 * requires) and the notice of appeal (Court of Appeal Rules r.76, Form B). The
 * others are working templates, not prescribed forms: they are a starting
 * point the advocate edits. Blanks are written as "____". */

type Text = { type: 'text'; text: string; marks?: { type: 'bold' }[] }
type Block =
  | { type: 'paragraph'; content?: Text[] }
  | { type: 'heading'; attrs: { level: 1 | 2 | 3 }; content: Text[] }
  | { type: 'orderedList'; content: { type: 'listItem'; content: Block[] }[] }

const text = (t: string): Text[] => (t ? [{ type: 'text', text: t }] : [])
const p = (t = ''): Block => ({ type: 'paragraph', content: text(t) })
const bold = (t: string): Block => ({ type: 'paragraph', content: [{ type: 'text', text: t, marks: [{ type: 'bold' }] }] })
const h = (t: string, level: 1 | 2 | 3 = 2): Block => ({ type: 'heading', attrs: { level }, content: text(t) })
const ol = (items: string[]): Block => ({ type: 'orderedList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) })
const doc = (blocks: Block[]) => JSON.stringify({ type: 'doc', content: blocks })

export type TemplateContext = {
  court: string
  courtNumber: string
  client: string
  otherSide: string
  firm: string
  address: string
  advocate: string
  /** "30th day of September, 2026" */
  today: string
  /** The kind of matter: the client's side follows it. */
  matterType: string
  offence: string
  ourRef: string
  /** "14th day of October, 2026", or empty. */
  nextHearing: string
  /** Whole days the client has been on remand on this charge, when recorded. */
  remandDays: number | null
}

export type Template = {
  id: string
  /** The backend's document kind (domain/documents.rs KINDS). */
  kind: string
  /** Kinds of matter it is offered for. */
  for: readonly string[]
  /** Only for these countries; undefined is any. */
  countries?: readonly string[]
  label: () => string
  title: (c: TemplateContext) => string
  body: (c: TemplateContext) => string
}

const caption = (c: TemplateContext, what: string, plaintiff: string, defendant: string, first = 'PLAINTIFF', second = 'DEFENDANT'): Block[] => [
  bold('THE REPUBLIC OF UGANDA'),
  bold(`IN THE ${c.court.toUpperCase() || '____ COURT'}`),
  bold(`${what} NO. ${c.courtNumber || '____ OF 20__'}`),
  p(`${plaintiff || '____'} :::::::::: ${first}`),
  bold('VERSUS'),
  p(`${defendant || '____'} :::::::::: ${second}`),
]

/** The caption and the client's side for templates offered across kinds of
 * matter. A civil client is taken as the plaintiff: the matter does not record
 * which side it is, so the advocate edits it when acting for the defence. */
const sides = (c: TemplateContext): { caption: Block[]; ours: string } => {
  if (c.matterType === 'criminal_defence') return { caption: caption(c, 'CRIMINAL CASE', 'UGANDA', c.client, 'PROSECUTOR', 'ACCUSED'), ours: 'ACCUSED' }
  if (c.matterType === 'private_prosecution') return { caption: caption(c, 'CRIMINAL CASE', c.client, c.otherSide, 'PROSECUTOR', 'ACCUSED'), ours: 'PROSECUTOR' }
  if (c.matterType === 'appeal') return { caption: caption(c, 'CIVIL APPEAL', c.client, c.otherSide, 'APPELLANT', 'RESPONDENT'), ours: 'APPELLANT' }
  return { caption: caption(c, 'CIVIL SUIT', c.client, c.otherSide), ours: 'PLAINTIFF' }
}

const signOff = (c: TemplateContext, forWhom: string): Block[] => [
  p(`DATED at ____ this ${c.today}.`),
  p(),
  p('____________________'),
  p(`${c.firm || c.advocate}`),
  p(`ADVOCATES FOR THE ${forWhom}`),
]

const LITIGATION = ['civil_suit', 'government_suit', 'employment_claim', 'family_case']
const CIVIL_COURT = [...LITIGATION, 'application', 'succession']
const APPEAL = ['appeal', 'civil_suit', 'application', 'government_suit', 'employment_claim', 'family_case', 'criminal_defence']

export const templates: readonly Template[] = [
  {
    id: 'plaint',
    kind: 'plaint',
    for: LITIGATION,
    countries: ['ug'],
    label: () => m["template.plaint"](),
    title: (c) => `Plaint: ${c.client} v. ${c.otherSide || '____'}`,
    body: (c) =>
      doc([
        ...caption(c, 'CIVIL SUIT', c.client, c.otherSide),
        h('PLAINT'),
        ol([
          `The Plaintiff, ${c.client}, is ____ whose address for service for the purposes of this suit is c/o ${[c.firm, c.address].filter(Boolean).join(', ') || '____'}.`,
          `The Defendant, ${c.otherSide || '____'}, is ____. Service of summons will be effected through the Plaintiff's advocates.`,
          "The Plaintiff's claim against the Defendant is for ____.",
          'The facts constituting the cause of action arose on or about ____ at ____ as follows: ____.',
          ...(c.matterType === 'government_suit'
            ? ['A written notice of intention to sue was delivered to ____ on ____, as required by section 2 of the Civil Procedure and Limitation (Miscellaneous Provisions) Act.']
            : []),
          'This Honourable Court has jurisdiction to hear and determine this suit.',
        ]),
        p('WHEREFORE the Plaintiff prays for judgment against the Defendant for:'),
        ol(['____', 'Interest at ____ per cent per annum from ____ until payment in full.', 'Costs of the suit.', 'Any other relief this Honourable Court deems fit.']),
        ...signOff(c, 'PLAINTIFF'),
      ]),
  },
  {
    id: 'written_statement_of_defence',
    kind: 'written_statement_of_defence',
    for: LITIGATION,
    countries: ['ug'],
    label: () => m["template.written_statement_of_defence"](),
    title: (c) => `Written statement of defence: ${c.client}`,
    body: (c) =>
      doc([
        ...caption(c, 'CIVIL SUIT', c.otherSide, c.client),
        h('WRITTEN STATEMENT OF DEFENCE'),
        ol([
          `The Defendant's address for service for the purposes of this suit is c/o ${[c.firm, c.address].filter(Boolean).join(', ') || '____'}.`,
          'Save as is hereinafter expressly admitted, the Defendant denies each and every allegation in the plaint as if the same were set out and traversed seriatim.',
          'The Defendant admits paragraph(s) ____ of the plaint.',
          'In answer to paragraph ____, the Defendant avers that ____.',
          'The Defendant shall raise a preliminary objection that ____.',
        ]),
        p('WHEREFORE the Defendant prays that the suit be dismissed with costs.'),
        ...signOff(c, 'DEFENDANT'),
      ]),
  },
  {
    id: 'reply',
    kind: 'reply',
    for: LITIGATION,
    countries: ['ug'],
    label: () => m["template.reply"](),
    title: (c) => `Reply to the defence: ${c.client}`,
    body: (c) =>
      doc([
        ...caption(c, 'CIVIL SUIT', c.client, c.otherSide),
        h('REPLY TO THE WRITTEN STATEMENT OF DEFENCE'),
        ol(['The Plaintiff joins issue with the Defendant upon the written statement of defence save in so far as it contains admissions.', 'In reply to paragraph ____ of the defence, the Plaintiff avers that ____.']),
        ...signOff(c, 'PLAINTIFF'),
      ]),
  },
  {
    id: 'notice_of_motion',
    kind: 'notice_of_motion',
    for: CIVIL_COURT,
    countries: ['ug'],
    label: () => m["template.notice_of_motion"](),
    title: () => 'Notice of motion',
    body: (c) =>
      doc([
        ...caption(c, 'MISCELLANEOUS APPLICATION', c.client, c.otherSide, 'APPLICANT', 'RESPONDENT'),
        h('NOTICE OF MOTION'),
        p('(Under ____ of the Civil Procedure Act and Order ____ rule ____ of the Civil Procedure Rules)'),
        p('TAKE NOTICE that this Honourable Court will be moved on the ____ day of ____, 20__ at ____ o\'clock in the forenoon, or so soon thereafter as counsel for the Applicant can be heard, for orders that:'),
        ol(['____', 'The costs of this application be provided for.']),
        p('The grounds of this application are set out in the affidavit of ____ attached hereto, and briefly are that:'),
        ol(['____']),
        ...signOff(c, 'APPLICANT'),
      ]),
  },
  {
    id: 'affidavit',
    kind: 'affidavit',
    for: [...CIVIL_COURT, 'criminal_defence', 'appeal', 'legal_aid_case'],
    countries: ['ug'],
    label: () => m["template.affidavit"](),
    title: () => 'Affidavit',
    body: (c) =>
      doc([
        ...sides(c).caption,
        h('AFFIDAVIT'),
        p('I, ____, of ____, a male/female adult Ugandan of sound mind, make oath and state as follows:'),
        ol(['That I am the ____ in this matter and swear this affidavit in that capacity.', 'That ____.', 'That whatever is stated herein is true to the best of my knowledge and belief.']),
        p(`SWORN at ____ this ${c.today}`),
        p('____________________ DEPONENT'),
        p('BEFORE ME:'),
        p('____________________'),
        p('COMMISSIONER FOR OATHS'),
      ]),
  },
  {
    id: 'affidavit_of_service',
    kind: 'affidavit_of_service',
    for: [...CIVIL_COURT, 'appeal'],
    countries: ['ug'],
    label: () => m["template.affidavit_of_service"](),
    title: () => 'Affidavit of service',
    body: (c) =>
      doc([
        ...caption(c, 'CIVIL SUIT', c.client, c.otherSide),
        h('AFFIDAVIT OF SERVICE'),
        p('I, ____, of ____, a process server/court clerk, make oath and state as follows:'),
        ol(['That on the ____ day of ____, 20__ I received the ____ for service on ____.', 'That on the ____ day of ____, 20__ at about ____ I served ____ at ____, who acknowledged service by signing/stamping the copy returned herewith.']),
        p(`SWORN at ____ this ${c.today}`),
        p('____________________ DEPONENT'),
        p('BEFORE ME: ____________________ COMMISSIONER FOR OATHS'),
      ]),
  },
  {
    id: 'notice_of_appeal',
    kind: 'notice_of_appeal',
    for: APPEAL,
    countries: ['ug'],
    label: () => m["template.notice_of_appeal"](),
    title: () => 'Notice of appeal',
    body: (c) =>
      doc([
        bold('THE REPUBLIC OF UGANDA'),
        bold('IN THE COURT OF APPEAL OF UGANDA AT KAMPALA'),
        bold(`(Appeal from the decision of the ${c.court || '____'} in ${c.courtNumber || '____'})`),
        p(`${c.client} :::::::::: APPELLANT`),
        bold('VERSUS'),
        p(`${c.otherSide || '____'} :::::::::: RESPONDENT`),
        h('NOTICE OF APPEAL'),
        p('(Rule 76 of the Judicature (Court of Appeal Rules) Directions, Form B)'),
        p(`TAKE NOTICE that ${c.client}, being dissatisfied with the decision of ____ given at ____ on the ____ day of ____, 20__, intends to appeal to the Court of Appeal against the whole / the following part of the said decision: ____.`),
        p(`The address for service of the appellant is c/o ${[c.firm, c.address].filter(Boolean).join(', ') || '____'}.`),
        p(`It is intended to serve copies of this notice on ${c.otherSide || '____'} of ____.`),
        p(`DATED this ${c.today}.`),
        p('____________________'),
        p('Signed by / for the appellant. Retained to appear at the hearing of the appeal.'),
        p('To: The Registrar, High Court of Uganda at ____'),
      ]),
  },
  {
    id: 'memorandum_of_appeal',
    kind: 'memorandum_of_appeal',
    for: ['appeal'],
    countries: ['ug'],
    label: () => m["template.memorandum_of_appeal"](),
    title: () => 'Memorandum of appeal',
    body: (c) =>
      doc([
        bold('THE REPUBLIC OF UGANDA'),
        bold('IN THE COURT OF APPEAL OF UGANDA AT KAMPALA'),
        bold(`CIVIL APPEAL NO. ${c.courtNumber || '____ OF 20__'}`),
        p(`${c.client} :::::::::: APPELLANT`),
        bold('VERSUS'),
        p(`${c.otherSide || '____'} :::::::::: RESPONDENT`),
        h('MEMORANDUM OF APPEAL'),
        p(`${c.client}, the appellant above named, appeals to the Court of Appeal against the decision of ____ on the following grounds:`),
        ol(['The learned judge erred in law and fact when ____.', 'The learned judge failed to properly evaluate the evidence on record and thereby came to a wrong conclusion.']),
        p('The appellant proposes to ask the Court for orders that the appeal be allowed, the decision be set aside, and costs here and below.'),
        ...signOff(c, 'APPELLANT'),
      ]),
  },
  {
    id: 'demand_letter',
    kind: 'demand_letter',
    for: ['civil_suit', 'employment_claim', 'land_transaction', 'company_matter', 'advice'],
    label: () => m["template.demand_letter"](),
    title: (c) => `Notice of demand to ${c.otherSide || '____'}`,
    body: (c) =>
      doc([
        p(c.today ? `Date: ${c.today}` : ''),
        p(`To: ${c.otherSide || '____'}`),
        p('____'),
        bold(`RE: DEMAND FOR PAYMENT OF ____ ON BEHALF OF ${c.client.toUpperCase()}`),
        p(`We act for ${c.client} (our client), on whose instructions we write.`),
        p('Our client instructs us that ____.'),
        p('We are instructed to demand, as we hereby do, that you pay our client the sum of ____ within seven (7) days of receipt of this letter, failing which we have firm instructions to institute legal proceedings against you without further notice, at your risk as to costs.'),
        p('Yours faithfully,'),
        p(''),
        p(`${c.firm || c.advocate}`),
      ]),
  },
  {
    id: 'government_notice',
    kind: 'government_notice',
    for: ['government_suit'],
    countries: ['ug'],
    label: () => m["template.government_notice"](),
    title: () => 'Notice of intention to sue Government',
    body: (c) =>
      doc([
        h('NOTICE OF INTENTION TO SUE'),
        p('(Section 2 of the Civil Procedure and Limitation (Miscellaneous Provisions) Act)'),
        p('To: The Attorney General, Attorney General\'s Chambers, ____ (or the officer the First Schedule names for the intended defendant)'),
        p(`TAKE NOTICE that ${c.client}, of ____ (the intending plaintiff's description and place of residence), intends, at the expiration of forty-five days after this notice is delivered, to institute a suit against ${c.otherSide || 'the Government of Uganda'} in the ${c.court || '____'}.`),
        bold('Facts constituting the cause of action, and when it arose'),
        p('____'),
        bold('Relief that will be claimed'),
        ol(['____', 'Costs of the suit.']),
        bold('Value of the subject matter of the intended suit'),
        p('____'),
        p(`DATED at ____ this ${c.today}.`),
        p('____________________'),
        p(`${c.firm || c.advocate}, advocates for the intending plaintiff`),
      ]),
  },
  {
    id: 'sale_agreement',
    kind: 'sale_agreement',
    for: ['land_transaction'],
    label: () => m["template.sale_agreement"](),
    title: (c) => `Agreement for sale of land: ${c.client} and ${c.otherSide || '____'}`,
    body: (c) =>
      doc([
        h('AGREEMENT FOR SALE OF LAND'),
        p(`THIS AGREEMENT is made this ${c.today} BETWEEN ____ of ____ (the Vendor) AND ____ of ____ (the Purchaser).`),
        bold('WHEREAS'),
        ol(['The Vendor is the registered proprietor of land comprised in ____ Block ____ Plot ____ at ____ (the Land).', 'The Vendor has agreed to sell and the Purchaser has agreed to buy the Land on the terms below.']),
        bold('NOW IT IS AGREED as follows:'),
        ol([
          'The purchase price is ____, payable as follows: ____.',
          'The Vendor shall deliver to the Purchaser the duplicate certificate of title, signed transfer forms, passport photographs, a copy of identification and any consent required, on payment of the balance.',
          'The Vendor warrants that the Land is free from encumbrances, caveats and adverse claims, save ____.',
          'Vacant possession shall be given on ____.',
          'Each party bears its own costs; the Purchaser pays stamp duty and registration fees.',
        ]),
        p('SIGNED by the Vendor ____________________ in the presence of ____________________'),
        p('SIGNED by the Purchaser ____________________ in the presence of ____________________'),
        p(`Drawn by: ${[c.advocate, c.firm, c.address].filter(Boolean).join(', ')}`),
      ]),
  },
  {
    id: 'petition',
    kind: 'petition',
    for: ['succession', 'family_case'],
    countries: ['ug'],
    label: () => m["template.petition"](),
    title: () => 'Petition for letters of administration',
    body: (c) =>
      doc([
        bold('THE REPUBLIC OF UGANDA'),
        bold(`IN THE ${c.court.toUpperCase() || 'HIGH COURT OF UGANDA AT ____'}`),
        bold(`ADMINISTRATION CAUSE NO. ${c.courtNumber || '____ OF 20__'}`),
        bold('IN THE MATTER OF THE ESTATE OF THE LATE ____'),
        p(`AND IN THE MATTER OF A PETITION FOR LETTERS OF ADMINISTRATION BY ${c.client.toUpperCase()}`),
        h('PETITION'),
        ol(['The deceased, ____, died intestate on ____ at ____, having his/her fixed place of abode at ____.', `The petitioner, ${c.client}, is the ____ of the deceased.`, 'The deceased left the following property: ____.', 'The deceased was survived by: ____.']),
        p('The petitioner prays that letters of administration of the estate of the deceased be granted to him/her.'),
        ...signOff(c, 'PETITIONER'),
      ]),
  },
  {
    id: 'bail_application',
    kind: 'bail_application',
    for: ['criminal_defence'],
    label: () => m["template.bail_application"](),
    title: (c) => `Application for bail: ${c.client}`,
    body: (c) =>
      doc([
        ...caption(c, 'CRIMINAL CASE', 'UGANDA', c.client, 'PROSECUTOR', 'ACCUSED'),
        h('APPLICATION FOR BAIL'),
        p(`The applicant, ${c.client}, charged with ${c.offence || '____'}, applies to be released on bail pending trial on the following grounds:`),
        ol(['The applicant has a fixed place of abode at ____.', 'The applicant has substantial sureties who are ready to stand for him/her: ____.', 'The applicant is presumed innocent (Article 28(3)(a) of the Constitution) and undertakes to appear whenever required.', '____']),
        ...signOff(c, 'APPLICANT'),
      ]),
  },
  {
    id: 'mitigation',
    kind: 'mitigation',
    for: ['criminal_defence'],
    label: () => m["template.mitigation"](),
    title: (c) => `Submissions in mitigation: ${c.client}`,
    body: (c) =>
      doc([
        ...caption(c, 'CRIMINAL CASE', 'UGANDA', c.client, 'PROSECUTOR', 'ACCUSED'),
        h('SUBMISSIONS IN MITIGATION'),
        ol([`${c.client} is a first offender aged ____.`, 'He/she has readily pleaded guilty and saved the court\'s time.', `He/she has spent ${c.remandDays != null ? `${c.remandDays} days` : '____'} on remand, which the court is asked to take into account (Article 23(8) of the Constitution).`, 'He/she has dependants: ____.', '____']),
        p('We pray for a lenient sentence.'),
        ...signOff(c, 'ACCUSED'),
      ]),
  },
  {
    id: 'submissions',
    kind: 'submissions',
    for: [...CIVIL_COURT, 'criminal_defence', 'appeal', 'private_prosecution'],
    label: () => m["template.submissions"](),
    title: () => 'Written submissions',
    body: (c) => doc([...sides(c).caption, h('WRITTEN SUBMISSIONS'), h('Background', 3), p('____'), h('Issues', 3), ol(['____']), h('Submissions', 3), p('____'), h('Conclusion', 3), p('____'), ...signOff(c, sides(c).ours)]),
  },
  {
    id: 'list_of_authorities',
    kind: 'list_of_authorities',
    for: [...CIVIL_COURT, 'criminal_defence', 'appeal'],
    label: () => m["template.list_of_authorities"](),
    title: () => 'List of authorities',
    body: (c) => doc([...sides(c).caption, h('LIST OF AUTHORITIES'), bold('Statutes'), ol(['____']), bold('Cases'), ol(['____']), ...signOff(c, sides(c).ours)]),
  },
  {
    id: 'legal_opinion',
    kind: 'legal_opinion',
    for: ['advice', 'company_matter', 'land_transaction', 'government_suit', 'employment_claim'],
    label: () => m["template.legal_opinion"](),
    title: (c) => `Legal opinion for ${c.client}`,
    body: (c) =>
      doc([
        bold('PRIVILEGED AND CONFIDENTIAL'),
        p(`To: ${c.client}`),
        p(`Date: ${c.today}`),
        h('LEGAL OPINION'),
        h('1. Question', 3),
        p('You have asked us whether ____.'),
        h('2. Short answer', 3),
        p('____'),
        h('3. Facts we rely on', 3),
        p('____'),
        h('4. The law', 3),
        p('____'),
        h('5. Analysis', 3),
        p('____'),
        h('6. Recommendation', 3),
        p('____'),
        p('This opinion is given on the facts stated and the law as at its date, for the addressee only.'),
        p(`${c.firm || c.advocate}`),
      ]),
  },
  {
    id: 'referral_letter',
    kind: 'referral_letter',
    for: ['legal_aid_case'],
    label: () => m["template.referral_letter"](),
    title: (c) => `Referral of ${c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p('To: ____'),
        bold(`RE: REFERRAL OF ${c.client.toUpperCase()}`),
        p(`We refer to you ${c.client}, who came to us on ____ about ____.`),
        p('We have advised as follows: ____. The matter needs ____, which we cannot give.'),
        p('Copies of the documents we hold are attached. Please contact us on ____ if you need anything further.'),
        p(`${c.firm || c.advocate}`),
      ]),
  },
  {
    id: 'engagement_letter',
    kind: 'engagement_letter',
    for: ['*'],
    label: () => m["template.engagement_letter"](),
    title: (c) => `Engagement letter: ${c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p(`Our ref: ${c.ourRef || '____'}`),
        p(`To: ${c.client}`),
        bold(`RE: YOUR INSTRUCTIONS${c.offence ? `: ${c.offence.toUpperCase()}` : ''}`),
        p('Thank you for instructing us. This letter sets out what we will do for you, who will do it, how our fees are worked out and what we need from you.'),
        h('What we will do', 3),
        p('____'),
        h('Who will handle your matter', 3),
        p(`${c.advocate || '____'}, advocate, will be responsible for your matter.`),
        h('Our fees', 3),
        p('Our fees are ____ (an agreed fee, or charged at ____ per hour), together with court fees and other disbursements. We will ask for a deposit of ____ before we begin. You will receive a fee note for every payment.'),
        h('What we need from you', 3),
        ol(['All the papers you hold about this matter.', 'Prompt answers when we ask for instructions.', 'To tell us at once if anything changes.']),
        h('Confidentiality', 3),
        p('What you tell us is confidential and privileged, and will not be shared without your consent unless the law requires it.'),
        p('Please sign and return a copy of this letter to confirm these terms.'),
        p('Yours faithfully,'),
        p(`${c.firm || c.advocate}`),
        p(),
        p('I accept these terms: ____________________   Date: ____'),
      ]),
  },
  {
    id: 'progress_letter',
    kind: 'progress_letter',
    for: ['*'],
    label: () => m["template.progress_letter"](),
    title: (c) => `Progress of your matter: ${c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p(`Our ref: ${c.ourRef || '____'}`),
        p(`To: ${c.client}`),
        bold(`RE: ${c.courtNumber ? `${c.courtNumber}, ` : ''}${c.client.toUpperCase()}${c.otherSide ? ` v ${c.otherSide.toUpperCase()}` : ''}`),
        p('We write to update you on your matter.'),
        h('What has happened', 3),
        p('____'),
        h('What happens next', 3),
        p(c.nextHearing ? `The matter comes up next on the ${c.nextHearing} at ${c.court || '____'}.` : 'No date has yet been fixed. We will tell you as soon as one is.'),
        h('What we need from you', 3),
        p('____'),
        p('Yours faithfully,'),
        p(`${c.firm || c.advocate}`),
      ]),
  },
  {
    id: 'registrar_letter',
    kind: 'registrar_letter',
    for: [...CIVIL_COURT, 'criminal_defence', 'appeal', 'private_prosecution'],
    label: () => m["template.registrar_letter"](),
    title: (c) => `Letter to the Registrar: ${c.courtNumber || c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p(`Our ref: ${c.ourRef || '____'}`),
        p(`The Registrar,`),
        p(`${c.court || '____'}`),
        bold(`RE: ${c.courtNumber || '____'}, ${c.client.toUpperCase()}${c.otherSide ? ` v ${c.otherSide.toUpperCase()}` : ''}`),
        p('We act for ____ in the above matter and write to request:'),
        ol(['that the matter be fixed for hearing on a date convenient to the court; or', 'certified copies of the record of proceedings and the judgment, for the purposes of appeal.', '____']),
        p('We undertake to pay the prescribed fees.'),
        p('Yours faithfully,'),
        p(`${c.firm || c.advocate}`),
        p(`c.c. ${c.otherSide || '____'}`),
      ]),
  },
  {
    id: 'deed_poll',
    kind: 'deed_poll',
    for: ['advice', 'legal_aid_case'],
    label: () => m["template.deed_poll"](),
    title: (c) => `Deed poll: change of name of ${c.client}`,
    body: (c) =>
      doc([
        bold('THE REPUBLIC OF UGANDA'),
        bold('IN THE MATTER OF THE REGISTRATION OF DOCUMENTS ACT, CAP. 81'),
        bold('AND IN THE MATTER OF THE OATHS ACT, CAP. 19'),
        bold(`AND IN THE MATTER OF A CHANGE OF NAME BY ${c.client.toUpperCase() || '____'}`),
        h('DEED POLL'),
        p(`BY THIS DEED POLL I, ${c.client || '____'}, of ____, a citizen of Uganda, formerly known as ____ (the former name), now wholly renounce, relinquish and abandon the use of my said former name and assume and adopt the name ${c.client || '____'} in its place.`),
        ol([
          'I shall at all times hereafter in all records, deeds and writings, and in all actions and proceedings and in all dealings and transactions, describe myself by the name I have assumed.',
          'I authorise and require all persons to designate and address me by that name only.',
          'I make this change for good reasons and not to defraud, avoid any obligation or mislead anyone: ____.',
        ]),
        p(`IN WITNESS WHEREOF I have signed this deed poll this ${c.today}.`),
        p(),
        p('SIGNED by the said ____ (formerly ____)   ____________________'),
        p('in the presence of:   ____________________ (name, address, signature of witness)'),
        p(),
        p(`SWORN at ____ this ${c.today}, before me:`),
        p('____________________'),
        p('COMMISSIONER FOR OATHS'),
        p(),
        p(`Drawn and filed by: ${c.firm || c.advocate}, ${c.address || '____'}`),
      ]),
  },
  {
    id: 'name_change_notice',
    kind: 'name_change_notice',
    for: ['advice', 'legal_aid_case'],
    label: () => m["template.name_change_notice"](),
    title: (c) => `Gazette notice: change of name of ${c.client}`,
    body: (c) =>
      doc([
        bold('NOTICE OF CHANGE OF NAME'),
        p(`Notice is given that by a deed poll dated ____ and registered with the Uganda Registration Services Bureau as instrument No. ____ on ____, I, ${c.client || '____'}, formerly known as ____, of ____, renounced and abandoned the use of my former name and assumed the name ${c.client || '____'}, by which I shall be known from now on.`),
        p(`Dated at ____ this ${c.today}.`),
        p(`${c.client || '____'}`),
        p(`c/o ${c.firm || c.advocate}, ${c.address || '____'}`),
      ]),
  },
  {
    id: 'police_bond_letter',
    kind: 'police_bond_letter',
    for: ['criminal_defence', 'legal_aid_case'],
    label: () => m["template.police_bond_letter"](),
    title: (c) => `Request for police bond: ${c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p(`Our ref: ${c.ourRef || '____'}`),
        p('The Officer in Charge,'),
        p('____ Police Station'),
        bold(`RE: REQUEST FOR RELEASE ON POLICE BOND OF ${c.client.toUpperCase() || '____'}, REF. ${c.courtNumber || 'SD/CRB ____'}`),
        p(`We act for ${c.client || '____'}, who was arrested on ____ and is held at your station${c.offence ? ` in connection with ${c.offence}` : ''}.`),
        p('Under Article 23(4)(b) of the Constitution a person arrested on suspicion of an offence must be brought before a court within 48 hours, and section 25 of the Police Act allows release on police bond, with or without a surety, while inquiries continue. Police bond is free of charge.'),
        p('We request that our client be released on police bond on the following terms:'),
        ol(['Our client has a fixed place of abode at ____.', 'The surety is ____, of ____, telephone ____, National ID No. ____ (copy attached).', 'Our client undertakes to report to the station whenever required.']),
        p('If our client is not released, we ask that he/she be produced before a court within the time the Constitution allows.'),
        p('Yours faithfully,'),
        p(`${c.firm || c.advocate}`),
        p(`${c.address || ''}`),
      ]),
  },
  {
    id: 'family_meeting_minutes',
    kind: 'family_meeting_minutes',
    for: ['succession', 'family_case', 'legal_aid_case'],
    label: () => m["template.family_meeting_minutes"](),
    title: (c) => `Minutes of the family meeting: estate of the late ____ (${c.client})`,
    body: (c) =>
      doc([
        bold('MINUTES OF A FAMILY MEETING OF THE FAMILY OF THE LATE ____'),
        p('Held at ____ on ____, starting at ____.'),
        h('Present', 3),
        ol(['____ (relationship to the deceased)', '____', '____']),
        h('1. The death', 3),
        p('The meeting noted that ____ died on ____ at ____ without leaving a will, survived by ____.'),
        h('2. The estate', 3),
        p('The property known to the family: ____.'),
        h('3. Who will apply', 3),
        p(`The meeting agreed that ${c.client || '____'} and ____ apply for letters of administration to the estate, and that the Administrator General be asked for a certificate of no objection.`),
        h('4. Close', 3),
        p('There being no other business, the meeting closed at ____.'),
        p(),
        p('Chairperson: ____________________   Secretary: ____________________'),
        p('Signatures of those present: ____'),
      ]),
  },
  {
    id: 'administrator_general_letter',
    kind: 'administrator_general_letter',
    for: ['succession', 'legal_aid_case'],
    label: () => m["template.administrator_general_letter"](),
    title: (c) => `Letter to the Administrator General: ${c.client}`,
    body: (c) =>
      doc([
        p(`Date: ${c.today}`),
        p(`Our ref: ${c.ourRef || '____'}`),
        p('The Administrator General,'),
        p('Ministry of Justice and Constitutional Affairs, ____'),
        bold('RE: REPORT OF DEATH AND REQUEST FOR A CERTIFICATE OF NO OBJECTION: ESTATE OF THE LATE ____'),
        p(`We act for ${c.client || '____'}, ____ (relationship) of the late ____, who died on ____ at ____ without leaving a will.`),
        p('The family met on ____ and agreed that our client and ____ apply for letters of administration. We enclose:'),
        ol(['A copy of the death certificate.', 'The minutes of the family meeting.', 'Copies of the National IDs of the proposed administrators.', 'A list of the known property of the estate.']),
        p('We request a certificate of no objection so that the proposed administrators may petition the High Court for letters of administration.'),
        p('Yours faithfully,'),
        p(`${c.firm || c.advocate}`),
      ]),
  },
  {
    id: 'letter',
    kind: 'letter',
    for: ['*'],
    label: () => m["template.letter"](),
    title: () => 'Letter',
    body: (c) => doc([p(`Date: ${c.today}`), p('To: ____'), bold(`RE: ${c.client.toUpperCase()}`), p('____'), p('Yours faithfully,'), p(`${c.firm || c.advocate}`)]),
  },
  {
    id: 'blank',
    kind: 'general',
    for: ['*'],
    label: () => m["template.blank"](),
    title: () => '',
    body: () => '',
  },
]

/** The templates offered for a kind of matter in a country. */
export function templatesFor(matterType: string, country: string | null | undefined) {
  return templates.filter((t) => (t.for.includes('*') || t.for.includes(matterType)) && (!t.countries || t.countries.includes(country ?? 'ug')))
}

/** "30th day of September, 2026": how a Ugandan document states its date. */
export function legalDate(ms: number) {
  const d = new Date(ms + 3 * 3_600_000)
  const day = d.getUTCDate()
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(d)
  return `${day}${suffix} day of ${month}, ${d.getUTCFullYear()}`
}

/** Kinds that go to a person, not a court: no caption, a letter's close. */
/** Letters from the practice: the only papers headed with its letterhead. */
export const LETTERS = new Set(['demand_letter', 'government_notice', 'referral_letter', 'letter', 'legal_opinion', 'engagement_letter', 'progress_letter', 'registrar_letter', 'police_bond_letter', 'administrator_general_letter'])

export const OUT_OF_COURT = new Set(['demand_letter', 'government_notice', 'sale_agreement', 'legal_opinion', 'referral_letter', 'letter', 'general', 'engagement_letter', 'progress_letter', 'registrar_letter', 'deed_poll', 'name_change_notice', 'police_bond_letter', 'family_meeting_minutes', 'administrator_general_letter'])

/** A document from paragraphs Assist drafted: the caption and sign-off are the
 * app's, the numbered paragraphs Assist's, for the advocate to edit. */
export function assistDraftBody(c: TemplateContext, kind: string, heading: string, paragraphs: string[]) {
  if (OUT_OF_COURT.has(kind)) {
    return doc([p(`Date: ${c.today}`), p('To: ____'), bold(`RE: ${heading.toUpperCase()}`), ol(paragraphs), p('Yours faithfully,'), p(), p('____________________'), p(`${c.firm || c.advocate}`)])
  }
  const { caption: head, ours } = sides(c)
  return doc([...head, h(heading.toUpperCase()), ol(paragraphs), ...signOff(c, ours)])
}

/** What a matter of this kind usually needs at this stage, first in the list
 * of papers to prepare. The rest of the templates follow. */
const NEEDS: Record<string, Record<string, readonly string[]>> = {
  criminal_defence: {
    instructions: ['engagement_letter', 'letter'],
    custody_bail: ['bail_application', 'affidavit', 'progress_letter'],
    plea_disclosure: ['letter', 'progress_letter'],
    trial: ['submissions', 'list_of_authorities', 'registrar_letter', 'progress_letter'],
    sentence: ['mitigation', 'progress_letter'],
    appeal: ['notice_of_appeal', 'registrar_letter', 'memorandum_of_appeal'],
  },
  appeal: {
    notice: ['notice_of_appeal', 'registrar_letter'],
    record: ['registrar_letter', 'letter'],
    memorandum: ['memorandum_of_appeal'],
    hearing: ['submissions', 'list_of_authorities'],
    judgment: ['progress_letter'],
  },
}
const CIVIL_NEEDS: Record<string, readonly string[]> = {
  instructions: ['engagement_letter', 'demand_letter', 'government_notice'],
  pleadings: ['plaint', 'written_statement_of_defence', 'reply', 'affidavit_of_service'],
  mediation: ['progress_letter', 'letter'],
  hearing: ['submissions', 'list_of_authorities', 'registrar_letter'],
  judgment: ['progress_letter', 'notice_of_appeal', 'registrar_letter'],
  order: ['progress_letter', 'registrar_letter'],
}

export function templatesNeeded(offered: readonly Template[], matterType: string, stage: string) {
  const ids = NEEDS[matterType]?.[stage] ?? CIVIL_NEEDS[stage] ?? ['engagement_letter', 'letter']
  return ids.map((id) => offered.find((t) => t.id === id)).filter((t): t is Template => !!t)
}
