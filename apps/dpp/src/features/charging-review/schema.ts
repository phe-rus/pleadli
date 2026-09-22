import * as z from 'zod'

export type Standard = 'two_stage' | 'threshold'
export type Test = 'evidential' | 'public_interest' | 'threshold'

export const standards = [
  {
    id: 'two_stage',
    label: 'Two-Stage Test',
    about: 'The default. The Evidential Test first, then the Public Interest Test only if the first is passed.',
  },
  {
    id: 'threshold',
    label: 'Threshold Test',
    about: 'A narrower test for rare, very serious cases where the investigation is incomplete but charging now is justified. All five requirements must be met, and the decision must be reviewed within 14 days.',
  },
] as const

export function standardLabel(standard: string) {
  return standards.find((s) => s.id === standard)?.label ?? standard
}

export type Criterion = { id: string; label: string; about: string }

// The named criteria of the ODPP Decision to Charge Guidelines
// (docs/dpp/RESEARCH.md §3). The server holds the same lists and refuses any
// other.
export const criteria: Record<Test, { label: string; about: string; items: readonly Criterion[] }> = {
  evidential: {
    label: 'Evidential Test',
    about: 'Is there a realistic prospect of conviction?',
    items: [
      { id: 'relevance', label: 'Relevance', about: 'Is the evidence relevant to what has to be proved?' },
      { id: 'admissibility', label: 'Admissibility', about: 'Can it be put before the court?' },
      { id: 'reliability', label: 'Reliability', about: 'Can the evidence be relied on?' },
      { id: 'credibility', label: 'Credibility', about: 'Are the witnesses credible?' },
      { id: 'availability', label: 'Availability', about: 'Is the evidence available, and will it stay so?' },
      { id: 'defence', label: 'Defence raised', about: 'Is a defence raised, and how does the evidence meet it?' },
    ],
  },
  public_interest: {
    label: 'Public Interest Test',
    about: 'Is prosecution in the public interest? Applied only once the Evidential Test is passed.',
    items: [
      { id: 'seriousness', label: 'Seriousness', about: 'How serious is the offence?' },
      { id: 'culpability', label: 'Culpability', about: 'How culpable is the suspect?' },
      { id: 'harm', label: 'Harm', about: 'The harm to the victim and to the community.' },
      { id: 'age', label: 'Age', about: 'The age of the suspect.' },
      { id: 'proportionality', label: 'Proportionality', about: 'Is prosecution a proportionate response?' },
      { id: 'out_of_court_disposal', label: 'Out-of-court disposal', about: 'Is an alternative to prosecution available?' },
      { id: 'sensitive_information', label: 'Sensitive information', about: 'Does protecting sensitive information weigh against prosecuting?' },
    ],
  },
  threshold: {
    label: 'Threshold Test',
    about: 'All five requirements must be met.',
    items: [
      { id: 'threshold_guilt', label: 'Reasonable grounds to believe guilt', about: 'The key evidence gives reasonable grounds to believe the suspect committed the offence.' },
      { id: 'threshold_further_evidence', label: 'Further evidence is expected', about: 'There are reasonable grounds to believe further evidence will emerge, with timelines for what is outstanding.' },
      { id: 'threshold_seriousness', label: 'Seriousness justifies charging now', about: 'A summary of the facts explaining why the seriousness justifies an immediate charge.' },
      { id: 'threshold_bail', label: 'Substantial grounds to object to bail', about: 'For example, the risk that the suspect will abscond.' },
      { id: 'threshold_public_interest', label: 'Public interest in charging', about: 'Charging now is in the public interest.' },
    ],
  },
}

export const testsFor = (standard: string): Test[] => (standard === 'threshold' ? ['threshold'] : ['evidential', 'public_interest'])

export const findings = [
  { id: 'favours', label: 'Favours charging' },
  { id: 'against', label: 'Against charging' },
  { id: 'unresolved', label: 'Unresolved' },
] as const

export type Finding = (typeof findings)[number]['id']

export const assessmentSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  test: z.string(),
  criterion: z.string(),
  finding: z.string(),
  note: z.string().nullable(),
  updatedAt: z.number(),
})

export const chargingReviewSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  standard: z.string(),
  evidentialOutcome: z.string().nullable(),
  publicInterestOutcome: z.string().nullable(),
  thresholdOutcome: z.string().nullable(),
  startedBy: z.string().nullable(),
  startedAt: z.number(),
  concludedAt: z.number().nullable(),
  reopensDecisionId: z.string().nullable(),
  reopenReason: z.string().nullable(),
  assessments: z.array(assessmentSchema),
})

export type ChargingReview = z.infer<typeof chargingReviewSchema>

/** The charging decisions a review's recorded outcomes allow. The server holds
 * the same rules (`permits` in domain/charging_reviews.rs) and is the one that
 * refuses; this only tells the prosecutor what to expect. */
export function permittedDecisions(review: ChargingReview): string[] {
  const ev = review.evidentialOutcome
  const pi = review.publicInterestOutcome
  const out: string[] = []
  if (review.standard === 'two_stage') {
    if (ev === 'passed' && pi === 'passed') out.push('sanction')
    if (ev === 'passed') out.push('divert')
    if (ev === 'failed' || (ev === 'passed' && pi === 'failed')) out.push('decline')
  } else if (review.thresholdOutcome === 'met') {
    out.push('threshold_charge')
  }
  out.push('return_for_investigation')
  return out
}

/** The decisions that are the outcome of applying a test. */
export const chargingDecisionTypes = ['sanction', 'threshold_charge', 'decline', 'divert', 'return_for_investigation']

/** Decisions that need written reasons. */
export const reasonedDecisionTypes = ['decline']

export const outcomeLabels: Record<string, string> = { passed: 'Passed', failed: 'Failed', met: 'Met', not_met: 'Not met' }

export function findingCounts(review: ChargingReview, test: Test) {
  const items = criteria[test].items
  const recorded = review.assessments.filter((a) => a.test === test)
  return { recorded: recorded.length, total: items.length, favourable: recorded.filter((a) => a.finding === 'favours').length }
}
