import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { adjournSitting, cancelSitting, getCauseList, holdSitting, rescheduleSitting, scheduleSitting } from './data'
import type { AdjournInput, SittingInput } from './schema'

export const causeListOptions = (from: number, to: number) =>
  queryOptions({ queryKey: ['cause-list', from, to] as const, queryFn: () => getCauseList(from, to) })

export const useCauseList = (from: number, to: number) => useSuspenseQuery(causeListOptions(from, to))

export const useScheduleSitting = () => useMutation({ mutationFn: (v: { caseId: string; input: SittingInput }) => scheduleSitting(v.caseId, v.input) })
export const useRescheduleSitting = () => useMutation({ mutationFn: (v: { id: string; input: SittingInput }) => rescheduleSitting(v.id, v.input) })
export const useHoldSitting = () => useMutation({ mutationFn: (v: { id: string; outcome: string }) => holdSitting(v.id, v.outcome) })
export const useCancelSitting = () => useMutation({ mutationFn: (v: { id: string; note: string | null }) => cancelSitting(v.id, v.note) })
export const useAdjournSitting = () => useMutation({ mutationFn: (v: { id: string; input: AdjournInput }) => adjournSitting(v.id, v.input) })
