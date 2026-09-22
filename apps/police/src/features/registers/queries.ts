import { queryOptions, useQuery } from '@tanstack/react-query'
import { getNextRegisterNumber } from './data'
import type { RegisterKind } from './schema'

export const nextRegisterNumberOptions = (kind: RegisterKind) =>
  queryOptions({
    queryKey: ['registers', 'next', kind] as const,
    queryFn: () => getNextRegisterNumber(kind),
  })

/** A suggestion for a form to show. Not suspending: a form works without it. */
export function useNextRegisterNumber(kind: RegisterKind) {
  return useQuery(nextRegisterNumberOptions(kind))
}
