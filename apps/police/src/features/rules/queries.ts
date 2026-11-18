import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRules, importRules } from './data'
import type { Pack, Rule } from './schema'

export const rulesOptions = () => queryOptions({ queryKey: ['rules'] as const, queryFn: () => getRules(), staleTime: 5 * 60_000 })

export function useRules() {
  return useQuery(rulesOptions())
}

export function useImportRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: string) => importRules(json),
    onSuccess: (pack) => queryClient.setQueryData(rulesOptions().queryKey, pack),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })
}

export const findRule = (pack: Pack | undefined, id: string): Rule | undefined => pack?.rules.find((rule) => rule.id === id)
