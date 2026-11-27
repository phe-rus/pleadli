import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearSignature, loadMakerSignature, loadSignature, saveMakerSignature, saveSignature } from './data'

const key = (officerId: string | undefined) => ['signature', officerId] as const

/** The signed-in officer's signature as an image, or null when none is kept. */
export function useSignature(officerId: string | undefined) {
  return useQuery({ queryKey: key(officerId), queryFn: () => loadSignature(officerId!), enabled: !!officerId, staleTime: 5 * 60_000 })
}
export function useSaveSignature(officerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (png: string) => saveSignature(officerId!, png),
    // The picture shows at once; a failed save puts the old one back.
    onMutate: async (png) => {
      await qc.cancelQueries({ queryKey: key(officerId) })
      const before = qc.getQueryData<string | null>(key(officerId))
      qc.setQueryData(key(officerId), png)
      return { before }
    },
    onError: (_e, _png, ctx) => qc.setQueryData(key(officerId), ctx?.before ?? null),
    onSettled: () => qc.invalidateQueries({ queryKey: key(officerId) }),
  })
}
export function useClearSignature(officerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => clearSignature(officerId!),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key(officerId) })
      const before = qc.getQueryData<string | null>(key(officerId))
      qc.setQueryData(key(officerId), null)
      return { before }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key(officerId), ctx?.before ?? null),
    onSettled: () => qc.invalidateQueries({ queryKey: key(officerId) }),
  })
}

const makerKey = (statementId: string) => ['signature', 'maker', statementId] as const
export function useMakerSignature(statementId: string) {
  return useQuery({ queryKey: makerKey(statementId), queryFn: () => loadMakerSignature(statementId), staleTime: 5 * 60_000 })
}
export function useSaveMakerSignature(statementId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (png: string) => saveMakerSignature(statementId, png),
    onMutate: async (png) => {
      await qc.cancelQueries({ queryKey: makerKey(statementId) })
      const before = qc.getQueryData<string | null>(makerKey(statementId))
      qc.setQueryData(makerKey(statementId), png)
      return { before }
    },
    onError: (_e, _png, ctx) => qc.setQueryData(makerKey(statementId), ctx?.before ?? null),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: makerKey(statementId) })
      void qc.invalidateQueries({ queryKey: ['attachments'] })
    },
  })
}
