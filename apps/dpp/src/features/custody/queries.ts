import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustody, deleteCustody, listCustody, type NewCustodyEvent } from './data'

export const custodyOptions = (fileId?: string) => queryOptions({ queryKey: ['custody', fileId ?? 'open'] as const, queryFn: () => listCustody(fileId) })
export const useCustody = (fileId?: string) => useQuery(custodyOptions(fileId))

function useRefresh() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: ['custody'] }), queryClient.invalidateQueries({ queryKey: ['cases'] })])
}
export function useAddCustody() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (e: NewCustodyEvent) => createCustody(e), onSuccess: refresh })
}
export function useDeleteCustody() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => deleteCustody(id), onSuccess: refresh })
}
