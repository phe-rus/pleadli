import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchHeadOfficeDefaults,
  getEstatePolicy,
  getNumbering,
  saveEstateNumbering,
  saveEstateUniforms,
  saveNumbering,
  saveUniforms,
} from './data'

export const numberingOptions = () => ({ queryKey: ['numbering'] as const, queryFn: () => getNumbering() })
export const estatePolicyOptions = () => ({ queryKey: ['estate-policy'] as const, queryFn: () => getEstatePolicy() })

export function useNumbering(enabled = true) {
  return useQuery({ ...numberingOptions(), enabled, staleTime: 60_000 })
}

export function useEstatePolicy(enabled = true) {
  return useQuery({ ...estatePolicyOptions(), enabled })
}

function useRefreshing<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, keys: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] })
    },
  })
}

export const useSaveNumbering = () => useRefreshing(saveNumbering, ['numbering'])
export const useSaveUniforms = () => useRefreshing(saveUniforms, ['numbering'])
export const useFetchHeadOfficeDefaults = () => useRefreshing(() => fetchHeadOfficeDefaults(), ['numbering'])
export const useSaveEstateNumbering = () => useRefreshing(saveEstateNumbering, ['estate-policy'])
export const useSaveEstateUniforms = () => useRefreshing(saveEstateUniforms, ['estate-policy'])
