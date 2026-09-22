import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { listReviewsForFile, setAssessment, setOutcome, startReview } from './data'
import type { Finding, Test } from './schema'

export const reviewsForFileOptions = (fileId: string) =>
  queryOptions({ queryKey: ['charging-reviews', fileId] as const, queryFn: () => listReviewsForFile(fileId) })

export const useReviewsForFile = (fileId: string) => useSuspenseQuery(reviewsForFileOptions(fileId))

export const useStartReview = () => useMutation({ mutationFn: startReview })

export const useSetAssessment = () =>
  useMutation({ mutationFn: (v: { reviewId: string; criterion: string; finding: Finding; note: string }) => setAssessment(v.reviewId, v.criterion, v) })

export const useSetOutcome = () =>
  useMutation({ mutationFn: (v: { reviewId: string; test: Test; outcome: string | null }) => setOutcome(v.reviewId, v.test, v.outcome) })
