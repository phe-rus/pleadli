import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { getReturns } from './data'

export const returnsOptions = (days: number) => queryOptions({ queryKey: ['reports', 'returns', days] as const, queryFn: () => getReturns(days) })
export const useReturns = (days: number) => useSuspenseQuery(returnsOptions(days))
