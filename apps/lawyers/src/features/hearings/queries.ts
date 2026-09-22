import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { adjournHearing, attendHearing, cancelHearing, getDiary, missHearing, rescheduleHearing, scheduleHearing } from './data'
import type { AdjournInput, HearingInput } from './schema'

export const diaryOptions = (from: number, to: number) => queryOptions({ queryKey: ['diary', from, to] as const, queryFn: () => getDiary(from, to) })
export const useDiary = (from: number, to: number) => useSuspenseQuery(diaryOptions(from, to))

export const useScheduleHearing = () => useMutation({ mutationFn: (v: { matterId: string; input: HearingInput }) => scheduleHearing(v.matterId, v.input) })
export const useRescheduleHearing = () => useMutation({ mutationFn: (v: { id: string; input: HearingInput }) => rescheduleHearing(v.id, v.input) })
export const useAttendHearing = () => useMutation({ mutationFn: (v: { id: string; outcome: string }) => attendHearing(v.id, v.outcome) })
export const useMissHearing = () => useMutation({ mutationFn: (v: { id: string; note: string | null }) => missHearing(v.id, v.note) })
export const useCancelHearing = () => useMutation({ mutationFn: (v: { id: string; note: string | null }) => cancelHearing(v.id, v.note) })
export const useAdjournHearing = () => useMutation({ mutationFn: (v: { id: string; input: AdjournInput }) => adjournHearing(v.id, v.input) })
