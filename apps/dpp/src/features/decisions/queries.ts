import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createDecision, listDecisionsForFile } from './data'
import type { CreateDecisionInput } from './schema'

export const decisionsForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['decisions', 'file', prosecutionFileId] as const,
    queryFn: () => listDecisionsForFile(prosecutionFileId),
  })

export function useDecisionsForFile(prosecutionFileId: string) {
  return useSuspenseQuery(decisionsForFileOptions(prosecutionFileId))
}

export function useCreateDecision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDecisionInput) => createDecision(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['decisions', 'file', variables.prosecutionFileId] })
      queryClient.invalidateQueries({ queryKey: ['prosecution-files'] })
    },
  })
}
