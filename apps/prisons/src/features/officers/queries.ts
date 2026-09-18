import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createOfficer, listOfficers, updateOfficer } from './data'
import type { CreateOfficerInput, UpdateOfficerInput } from './schema'

export function useOfficers(enabled = true) {
  return useQuery({ queryKey: ['officers', 'list'] as const, queryFn: () => listOfficers(), enabled })
}

export function useCreateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOfficerInput) => createOfficer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useUpdateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOfficerInput }) => updateOfficer(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}
