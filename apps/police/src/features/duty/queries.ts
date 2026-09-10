import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createDutyAssignment, listDutyAssignments, updateDutyAssignment } from './data'
import type { CreateDutyAssignmentInput } from './schema'

export const dutyAssignmentsOptions = (query: string) =>
  queryOptions({
    queryKey: ['duty', 'list', query] as const,
    queryFn: () => listDutyAssignments(query),
  })

export function useDutyAssignments(query: string) {
  return useSuspenseQuery(dutyAssignmentsOptions(query))
}

export function useCreateDutyAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDutyAssignmentInput) => createDutyAssignment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duty', 'list'] })
    },
  })
}

export function useUpdateDutyAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateDutyAssignmentInput }) =>
      updateDutyAssignment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duty', 'list'] })
    },
  })
}
