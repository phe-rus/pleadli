import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createDraft, discardDocument, getDocument, getSeals, issueDocument, listDocuments, prepareDocument, refreshDocument, saveContent, setSignature, setStamp } from './data'

export const documentsOptions = (fileId?: string) => queryOptions({ queryKey: ['documents', 'list', fileId ?? 'all'] as const, queryFn: () => listDocuments(fileId) })
export const useDocuments = (fileId?: string) => useSuspenseQuery(documentsOptions(fileId))

export const documentOptions = (id: string) => queryOptions({ queryKey: ['documents', 'detail', id] as const, queryFn: () => getDocument(id) })
export const useDocument = (id: string) => useSuspenseQuery(documentOptions(id))

export const usePrepareDocument = () => useMutation({ mutationFn: prepareDocument })
export const useRefreshDocument = () => useMutation({ mutationFn: refreshDocument })
export const useIssueDocument = () => useMutation({ mutationFn: issueDocument })
export const useDiscardDocument = () => useMutation({ mutationFn: discardDocument })

export const useCreateDraft = () => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createDraft, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }) })
}
export const useSaveContent = () => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: saveContent, onSuccess: (doc) => queryClient.setQueryData(['documents', 'detail', doc.id], doc) })
}
export const sealsOptions = () => queryOptions({ queryKey: ['seals'] as const, queryFn: getSeals })
export const useSeals = () => useQuery(sealsOptions())
export const useSetSignature = () => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: setSignature, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seals'] }) })
}
export const useSetStamp = () => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: setStamp, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seals'] }) })
}
