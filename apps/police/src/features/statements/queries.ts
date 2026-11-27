import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStatement, listStatements, updateStatement } from './data'
import type { CreateStatementInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const statementsList = { listKey: ['statements', 'list'], invalidate: [['statements', 'list'], ['cases']], sortBy: 'givenAt' } satisfies ListConfig

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
    ...optimisticCreate(queryClient, statementsList),
  })
}

export function useUpdateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStatementInput }) => updateStatement(id, input),
    ...optimisticUpdate(queryClient, statementsList),
  })
}
