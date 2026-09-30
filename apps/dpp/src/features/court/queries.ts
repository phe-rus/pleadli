import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFiling, createHearing, deleteFiling, deleteHearing, getCalendar, listFilings, listHearings, updateHearing, type FilingInput, type HearingInput } from './data'

export const hearingsOptions = (fileId: string) => queryOptions({ queryKey: ['hearings', fileId] as const, queryFn: () => listHearings(fileId) })
export const filingsOptions = (fileId: string) => queryOptions({ queryKey: ['filings', fileId] as const, queryFn: () => listFilings(fileId) })
export const calendarOptions = (from: number, to: number) =>
  queryOptions({ queryKey: ['calendar', from, to] as const, queryFn: () => getCalendar(from, to), placeholderData: keepPreviousData })

export const useHearings = (fileId: string) => useQuery(hearingsOptions(fileId))
export const useFilings = (fileId: string) => useQuery(filingsOptions(fileId))
export const useCalendar = (from: number, to: number) => useQuery(calendarOptions(from, to))

function useRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(['hearings', 'filings', 'calendar'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}

export function useSaveHearing() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ id, input }: { id?: string; input: HearingInput }) => (id ? updateHearing(id, input) : createHearing(input)), onSuccess: refresh })
}
export function useDeleteHearing() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => deleteHearing(id), onSuccess: refresh })
}
export function useCreateFiling() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (input: FilingInput) => createFiling(input), onSuccess: refresh })
}
export function useDeleteFiling() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => deleteFiling(id), onSuccess: refresh })
}
