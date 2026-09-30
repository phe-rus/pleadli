import * as z from 'zod'
import * as m from '@/paraglide/messages'

export type Standard = 'two_stage' | 'threshold'
export type Test = 'evidential' | 'public_interest' | 'threshold'

export const standards = [
  {
    id: 'two_stage',
    get label() { return m["review.standard.two_stage.label"]() },
    get about() { return m["review.standard.two_stage.about"]() },
  },
  {
    id: 'threshold',
    get label() { return m["review.standard.threshold.label"]() },
    get about() { return m["review.standard.threshold.about"]() },
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
    get label() { return m["review.test.evidential.label"]() },
    get about() { return m["review.test.evidential.about"]() },
    items: [
      { id: 'relevance', get label() { return m["review.criterion.relevance.label"]() }, get about() { return m["review.criterion.relevance.about"]() } },
      { id: 'admissibility', get label() { return m["review.criterion.admissibility.label"]() }, get about() { return m["review.criterion.admissibility.about"]() } },
      { id: 'reliability', get label() { return m["review.criterion.reliability.label"]() }, get about() { return m["review.criterion.reliability.about"]() } },
      { id: 'credibility', get label() { return m["review.criterion.credibility.label"]() }, get about() { return m["review.criterion.credibility.about"]() } },
      { id: 'availability', get label() { return m["review.criterion.availability.label"]() }, get about() { return m["review.criterion.availability.about"]() } },
      { id: 'defence', get label() { return m["review.criterion.defence.label"]() }, get about() { return m["review.criterion.defence.about"]() } },
    ],
  },
  public_interest: {
    get label() { return m["review.test.public_interest.label"]() },
    get about() { return m["review.test.public_interest.about"]() },
    items: [
      { id: 'seriousness', get label() { return m["review.criterion.seriousness.label"]() }, get about() { return m["review.criterion.seriousness.about"]() } },
      { id: 'culpability', get label() { return m["review.criterion.culpability.label"]() }, get about() { return m["review.criterion.culpability.about"]() } },
      { id: 'harm', get label() { return m["review.criterion.harm.label"]() }, get about() { return m["review.criterion.harm.about"]() } },
      { id: 'age', get label() { return m["review.criterion.age.label"]() }, get about() { return m["review.criterion.age.about"]() } },
      { id: 'proportionality', get label() { return m["review.criterion.proportionality.label"]() }, get about() { return m["review.criterion.proportionality.about"]() } },
      { id: 'out_of_court_disposal', get label() { return m["review.criterion.out_of_court_disposal.label"]() }, get about() { return m["review.criterion.out_of_court_disposal.about"]() } },
      { id: 'sensitive_information', get label() { return m["review.criterion.sensitive_information.label"]() }, get about() { return m["review.criterion.sensitive_information.about"]() } },
    ],
  },
  threshold: {
    get label() { return m["review.test.threshold.label"]() },
    get about() { return m["review.test.threshold.about"]() },
    items: [
      { id: 'threshold_guilt', get label() { return m["review.criterion.threshold_guilt.label"]() }, get about() { return m["review.criterion.threshold_guilt.about"]() } },
      { id: 'threshold_further_evidence', get label() { return m["review.criterion.threshold_further_evidence.label"]() }, get about() { return m["review.criterion.threshold_further_evidence.about"]() } },
      { id: 'threshold_seriousness', get label() { return m["review.criterion.threshold_seriousness.label"]() }, get about() { return m["review.criterion.threshold_seriousness.about"]() } },
      { id: 'threshold_bail', get label() { return m["review.criterion.threshold_bail.label"]() }, get about() { return m["review.criterion.threshold_bail.about"]() } },
      { id: 'threshold_public_interest', get label() { return m["review.criterion.threshold_public_interest.label"]() }, get about() { return m["review.criterion.threshold_public_interest.about"]() } },
    ],
  },
}

export const testsFor = (standard: string): Test[] => (standard === 'threshold' ? ['threshold'] : ['evidential', 'public_interest'])

export const findings = [
  { id: 'favours', get label() { return m["review.finding.favours"]() } },
  { id: 'against', get label() { return m["review.finding.against"]() } },
  { id: 'unresolved', get label() { return m["review.finding.unresolved"]() } },
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

export const outcomeLabels: Record<string, string> = {
  get passed() { return m["review.outcome.passed"]() },
  get failed() { return m["review.outcome.failed"]() },
  get met() { return m["review.outcome.met"]() },
  get not_met() { return m["review.outcome.not_met"]() },
}

export function findingCounts(review: ChargingReview, test: Test) {
  const items = criteria[test].items
  const recorded = review.assessments.filter((a) => a.test === test)
  return { recorded: recorded.length, total: items.length, favourable: recorded.filter((a) => a.finding === 'favours').length }
}
