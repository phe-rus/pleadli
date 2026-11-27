import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearSignature, loadSignature, saveSignature } from './data'

const key = (officerId: string | undefined) => ['signature', officerId] as const

/** The signed-in officer's signature as an image, or null when none is kept. */
export function useSignature(officerId: string | undefined) {
  return useQuery({ queryKey: key(officerId), queryFn: () => loadSignature(officerId!), enabled: !!officerId, staleTime: 5 * 60_000 })
}

function useChange<V>(officerId: string | undefined, work: (v: V) => Promise<unknown>, optimistic: (v: V) => string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: work,
    // The picture shows at once; a failed save puts the old one back.
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: key(officerId) })
      const before = qc.getQueryData<string | null>(key(officerId))
      qc.setQueryData(key(officerId), optimistic(v))
      return { before }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key(officerId), ctx?.before ?? null),
    onSettled: () => qc.invalidateQueries({ queryKey: key(officerId) }),
  })
}
export const useSaveSignature = (officerId: string | undefined) => useChange<string>(officerId, (png) => saveSignature(officerId!, png), (png) => png)
export const useClearSignature = (officerId: string | undefined) => useChange<void>(officerId, () => clearSignature(officerId!), () => null)
