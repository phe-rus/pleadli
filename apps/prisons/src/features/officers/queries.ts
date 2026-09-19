import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createOfficer, deleteOfficer, listOfficerActivity, listOfficers, updateOfficer } from './data'
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
      // The edited account may be the signed-in one, whose permissions follow its role.
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export function useDeleteOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteOfficer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useOfficerActivity(filter: { officerId?: string; badge?: string }, enabled = true) {
  return useQuery({
    queryKey: ['officers', 'activity', filter] as const,
    queryFn: () => listOfficerActivity(filter),
    enabled: enabled && Boolean(filter.officerId || filter.badge),
  })
}
