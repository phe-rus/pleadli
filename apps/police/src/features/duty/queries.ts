import { useInstallation } from '@/features/session'
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createDutyAssignment, listDutyAssignments, updateDutyAssignment } from './data'
import type { CreateDutyAssignmentInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const dutyList = { listKey: ['duty', 'list'], invalidate: [['duty', 'list']], sortBy: 'shiftStart' } satisfies ListConfig

export const dutyAssignmentsOptions = (query: string) =>
  queryOptions({
    queryKey: ['duty', 'list', query] as const,
    queryFn: () => listDutyAssignments(query),
  })

/** The roster a page may show beside people: the station's, or nothing in a Command, which holds no station records and is refused the roster. */
export function useRosterIfStation() {
  const station = useInstallation().data?.mode === 'station'
  const { data } = useQuery({ ...dutyAssignmentsOptions(''), enabled: station })
  return data ?? []
}

export function useDutyAssignments(query: string) {
  return useSuspenseQuery(dutyAssignmentsOptions(query))
}

export function useCreateDutyAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDutyAssignmentInput) => createDutyAssignment(input),
    ...optimisticCreate(queryClient, dutyList),
  })
}

export function useUpdateDutyAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateDutyAssignmentInput }) =>
      updateDutyAssignment(id, input),
    ...optimisticUpdate(queryClient, dutyList),
  })
}
