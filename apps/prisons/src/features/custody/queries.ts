import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { expectInstrument, getPrisonerFile, recordInstrument, setSentence, supersedeInstrument } from './data'
import type { RecordInstrumentInput, SetSentenceInput } from './schema'

export const prisonerFileOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['custody', 'file', prisonerId] as const,
    queryFn: () => getPrisonerFile(prisonerId),
  })

export function usePrisonerFile(prisonerId: string) {
  return useSuspenseQuery(prisonerFileOptions(prisonerId))
}

function invalidateCustody(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['custody'] })
  queryClient.invalidateQueries({ queryKey: ['prisoners'] })
  queryClient.invalidateQueries({ queryKey: ['today'] })
  queryClient.invalidateQueries({ queryKey: ['legal'] })
}

export function useRecordInstrument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordInstrumentInput) => recordInstrument(input),
    onSuccess: () => invalidateCustody(queryClient),
  })
}

export function useExpectInstrument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ prisonerId, kind }: { prisonerId: string; kind: string }) => expectInstrument(prisonerId, kind),
    onSuccess: () => invalidateCustody(queryClient),
  })
}

export function useSupersedeInstrument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ instrumentId, reason }: { instrumentId: string; reason: string }) => supersedeInstrument(instrumentId, reason),
    onSuccess: () => invalidateCustody(queryClient),
  })
}

export function useSetSentence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetSentenceInput) => setSentence(input),
    onSuccess: () => invalidateCustody(queryClient),
  })
}
