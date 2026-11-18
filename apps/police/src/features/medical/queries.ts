import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createMedicalExam, listMedicalExams, updateMedicalExam } from './data'
import type { CreateMedicalExamInput } from './schema'

// An examination puts its person on the case, so the case and the person's page are refreshed too.
const medicalList = { listKey: ['medical', 'list'], invalidate: [['medical'], ['cases'], ['people', 'profile']], sortBy: 'requestedAt' } satisfies ListConfig

export const medicalOptions = (query: string) =>
  queryOptions({ queryKey: ['medical', 'list', query] as const, queryFn: () => listMedicalExams(query) })

export function useMedicalExams(query: string) {
  return useSuspenseQuery(medicalOptions(query))
}

export function useCreateMedicalExam() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (input: CreateMedicalExamInput) => createMedicalExam(input), ...optimisticCreate(queryClient, medicalList) })
}

export function useUpdateMedicalExam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateMedicalExamInput }) => updateMedicalExam(id, input),
    ...optimisticUpdate(queryClient, medicalList),
  })
}
