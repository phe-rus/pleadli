import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { chargingReviewSchema, type Finding, type Standard, type Test } from './schema'

export async function listReviewsForFile(fileId: string) {
  return z.array(chargingReviewSchema).parse(await api('GET', `/api/prosecution-files/${seg(fileId)}/charging-reviews`))
}

export async function startReview(input: { prosecutionFileId: string; standard: Standard; reopensDecisionId?: string; reopenReason?: string }) {
  return chargingReviewSchema.parse(await api('POST', '/api/charging-reviews', { body: input }))
}

export async function setAssessment(reviewId: string, criterion: string, input: { finding: Finding; note: string }) {
  const body = { finding: input.finding, note: orNull(input.note) }
  return chargingReviewSchema.parse(await api('PUT', `/api/charging-reviews/${seg(reviewId)}/assessments/${seg(criterion)}`, { body }))
}

export async function setOutcome(reviewId: string, test: Test, outcome: string | null) {
  return chargingReviewSchema.parse(await api('PUT', `/api/charging-reviews/${seg(reviewId)}/outcome`, { body: { test, outcome } }))
}
