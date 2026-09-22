import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { discardDocument, getDocument, issueDocument, listDocuments, prepareDocument, refreshDocument } from './data'

export const documentsOptions = (fileId?: string) => queryOptions({ queryKey: ['documents', 'list', fileId ?? 'all'] as const, queryFn: () => listDocuments(fileId) })
export const useDocuments = (fileId?: string) => useSuspenseQuery(documentsOptions(fileId))

export const documentOptions = (id: string) => queryOptions({ queryKey: ['documents', 'detail', id] as const, queryFn: () => getDocument(id) })
export const useDocument = (id: string) => useSuspenseQuery(documentOptions(id))

export const usePrepareDocument = () => useMutation({ mutationFn: prepareDocument })
export const useRefreshDocument = () => useMutation({ mutationFn: refreshDocument })
export const useIssueDocument = () => useMutation({ mutationFn: issueDocument })
export const useDiscardDocument = () => useMutation({ mutationFn: discardDocument })
