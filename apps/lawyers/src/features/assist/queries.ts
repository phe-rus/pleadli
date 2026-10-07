import { getLocale } from '@/paraglide/runtime'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { askAssist, getAssistSettings, listModels, saveAssistSettings, type AskInput, type AssistSettingsChange } from './data'
import { assistModel } from './model-choice'

export const assistSettingsOptions = () => queryOptions({ queryKey: ['assist', 'settings'] as const, queryFn: getAssistSettings })
export const useAssistSettings = () => useQuery(assistSettingsOptions())

export function useSaveAssistSettings() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (change: AssistSettingsChange) => saveAssistSettings(change), onSuccess: (s) => queryClient.setQueryData(['assist', 'settings'], s) })
}

/** One request; the answer is shown, not stored. It is written in the
 * language the person reads the app in. */
export const useAskAssist = (matterId: string) =>
  useMutation({ mutationFn: (input: Omit<AskInput, 'language' | 'model'>) => askAssist(matterId, { ...input, language: getLocale(), model: assistModel() || undefined }) })

/** The provider's models, for the chat's picker. Read once the key is set. */
export const useAssistModels = (enabled: boolean, provider?: string) =>
  useQuery({ queryKey: ['assist', 'models', provider], queryFn: listModels, enabled, staleTime: 30 * 60_000, retry: false })
