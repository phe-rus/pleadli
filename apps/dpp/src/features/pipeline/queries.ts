import { assistContext } from '@/features/assist/context'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { answerProposal, getBoard, listHandovers, listProposals, propose, recordHandover, setStage, type Handover, type Stage } from './data'

export const boardOptions = () => queryOptions({ queryKey: ['cases', 'board'] as const, queryFn: getBoard })
export const proposalsOptions = (fileId: string) => queryOptions({ queryKey: ['proposals', fileId] as const, queryFn: () => listProposals(fileId) })
export const handoversOptions = (fileId: string) => queryOptions({ queryKey: ['handovers', fileId] as const, queryFn: () => listHandovers(fileId) })

export const useBoard = () => useQuery(boardOptions())
export const useProposals = (fileId: string) => useQuery(proposalsOptions(fileId))
export const useHandovers = (fileId: string) => useQuery(handoversOptions(fileId))

/** Accepting a stage can touch almost anything on a file: refresh it all. */
function useRefreshAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

export function useSetStage() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: ({ fileId, stage }: { fileId: string; stage: Stage }) => setStage(fileId, stage), onSuccess: refresh })
}

export function usePropose(fileId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stage: string | null) => propose(fileId, stage, assistContext(fileId)),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['proposals', fileId] }), queryClient.invalidateQueries({ queryKey: ['cases'] })]),
  })
}

export function useAnswer() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: ({ id, answer, body, note }: { id: string; answer: 'accept' | 'reject'; body?: Record<string, unknown>; note?: string }) => answerProposal(id, answer, body, note),
    onSuccess: refresh,
  })
}

export function useRecordHandover() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: (input: { prosecutionFileId: string; recipient: string; method: Handover['method']; note?: string | null }) => recordHandover(input), onSuccess: refresh })
}
