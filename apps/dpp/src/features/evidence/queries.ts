import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createEvidenceItem, listEvidenceForFile } from './data'
import type { CreateEvidenceItemInput } from './schema'

export const evidenceForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['evidence', 'file', prosecutionFileId] as const,
    queryFn: () => listEvidenceForFile(prosecutionFileId),
  })

export function useEvidenceForFile(prosecutionFileId: string) {
  return useSuspenseQuery(evidenceForFileOptions(prosecutionFileId))
}

export function useCreateEvidenceItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEvidenceItemInput) => createEvidenceItem(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evidence', 'file', variables.prosecutionFileId] })
    },
  })
}
