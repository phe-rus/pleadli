import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStatement, listStatementsForFile } from './data'
import type { CreateStatementInput } from './schema'

export const statementsForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['statements', 'file', prosecutionFileId] as const,
    queryFn: () => listStatementsForFile(prosecutionFileId),
  })

export function useStatementsForFile(prosecutionFileId: string) {
  return useSuspenseQuery(statementsForFileOptions(prosecutionFileId))
}

export function useCreateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatementInput) => createStatement(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['statements', 'file', variables.prosecutionFileId] })
    },
  })
}
