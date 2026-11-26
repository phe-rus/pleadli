import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { giveOut, listEntries, listHolders, listYears, stampEntry, type RegisterId } from './data'

export const useEntries = (register: RegisterId, year: number) => useQuery({ queryKey: ['registry', 'entries', register, year] as const, queryFn: () => listEntries(register, year) })
export const useYears = () => useQuery({ queryKey: ['registry', 'years'] as const, queryFn: listYears })
export const useHolders = () => useQuery({ queryKey: ['registry', 'holders'] as const, queryFn: listHolders })

function useChanged() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['registry'] })
}
export const useGiveOut = () => useMutation({ mutationFn: giveOut, onSuccess: useChanged() })
export const useStamp = () => useMutation({ mutationFn: ({ id, label }: { id: string; label: string }) => stampEntry(id, label), onSuccess: useChanged() })
