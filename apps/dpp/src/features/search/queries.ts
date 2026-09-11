import { queryOptions, useQuery } from '@tanstack/react-query'
import { search } from './data'

export const searchOptions = (query: string) =>
  queryOptions({
    queryKey: ['search', query] as const,
    queryFn: () => search(query),
  })

export function useSearch(query: string) {
  return useQuery({ ...searchOptions(query), enabled: query.trim().length > 0 })
}
