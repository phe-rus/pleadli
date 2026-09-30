import { getLocale } from '@/paraglide/runtime'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { askAssist, getAssistSettings, saveAssistSettings, type AskInput, type AssistSettingsChange } from './data'

export const assistSettingsOptions = () => queryOptions({ queryKey: ['assist', 'settings'] as const, queryFn: getAssistSettings })
export const useAssistSettings = () => useQuery(assistSettingsOptions())

export function useSaveAssistSettings() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (change: AssistSettingsChange) => saveAssistSettings(change), onSuccess: (s) => queryClient.setQueryData(['assist', 'settings'], s) })
}

/** One request; the answer is shown, not stored. It is written in the
 * language the person reads the app in. */
export const useAskAssist = (matterId: string) => useMutation({ mutationFn: (input: Omit<AskInput, 'language'>) => askAssist(matterId, { ...input, language: getLocale() }) })
