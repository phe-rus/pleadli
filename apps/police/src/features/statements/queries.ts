import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStatement, listStatements, updateStatement } from './data'
import type { CreateStatementInput } from './schema'

export const statementsOptions = (query: string) =>
  queryOptions({
    queryKey: ['statements', 'list', query] as const,
    queryFn: () => listStatements(query),
  })

export function useStatements(query: string) {
  return useSuspenseQuery(statementsOptions(query))
}

export function useCreateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatementInput) => createStatement(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements', 'list'] })
    },
  })
}

export function useUpdateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStatementInput }) => updateStatement(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements', 'list'] })
    },
  })
}
