import { queryOptions, useQuery } from '@tanstack/react-query'
import { getAttention } from './data'
import type { Next } from './schema'

/** Keyed under `workload` so everything that already refreshes the counts
 * after a change refreshes this too: the two can never be a step apart. */
export const attentionOptions = () => queryOptions({ queryKey: ['workload', 'attention'] as const, queryFn: getAttention })

/** Every file's next step for the signed-in person, and the counts that follow. */
export function useAttention() {
  const { data } = useQuery(attentionOptions())
  const byFile = new Map<string, Next>((data?.items ?? []).map((n) => [n.fileId, n]))
  return { items: data?.items ?? [], summary: data?.summary, forFile: (id: string) => byFile.get(id) }
}
