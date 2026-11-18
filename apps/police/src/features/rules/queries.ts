import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setCustodyLimits } from '@/features/custody/schema'
import { getRules, importRules } from './data'
import type { Pack, Rule } from './schema'

/** Hand the limits in the rules to the code that counts custody against them. */
function applyRules(pack: Pack) {
  setCustodyLimits({ hours: findRule(pack, 'custody.limit_hours')?.value, transferDays: findRule(pack, 'custody.transfer_window_days')?.value })
}

export const rulesOptions = () =>
  queryOptions({
    queryKey: ['rules'] as const,
    queryFn: async () => {
      const pack = await getRules()
      applyRules(pack)
      return pack
    },
    staleTime: 5 * 60_000,
  })

export function useRules() {
  return useQuery(rulesOptions())
}

export function useImportRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: string) => importRules(json),
    onSuccess: (pack) => {
      applyRules(pack)
      queryClient.setQueryData(rulesOptions().queryKey, pack)
      // Everything counted against a limit is counted again under the new rules.
      void queryClient.invalidateQueries({ queryKey: ['custody'] })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })
}

export const findRule = (pack: Pack | undefined, id: string): Rule | undefined => pack?.rules.find((rule) => rule.id === id)
