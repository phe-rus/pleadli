import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistContext } from './context'
import { arrangeScans, getAssistSettings, getLatestBrief, requestBrief, saveAssistSettings, type AssistSettingsChange } from './data'

export const assistSettingsOptions = () => queryOptions({ queryKey: ['assist', 'settings'] as const, queryFn: getAssistSettings })
export const useAssistSettings = () => useQuery(assistSettingsOptions())

export const briefOptions = (fileId: string) => queryOptions({ queryKey: ['assist', 'brief', fileId] as const, queryFn: () => getLatestBrief(fileId) })
export const useBrief = (fileId: string) => useQuery(briefOptions(fileId))

export function useSaveAssistSettings() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (change: AssistSettingsChange) => saveAssistSettings(change), onSuccess: (s) => queryClient.setQueryData(['assist', 'settings'], s) })
}

export function useRequestBrief(fileId: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => requestBrief(fileId, assistContext()), onSuccess: (b) => queryClient.setQueryData(['assist', 'brief', fileId], b) })
}

export function useArrangeScans(fileId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attachmentIds: string[]) => arrangeScans(fileId, attachmentIds, assistContext()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['file-items', fileId] }),
  })
}
