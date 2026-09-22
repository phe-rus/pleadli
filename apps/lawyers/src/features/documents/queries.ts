import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createDocument, discardDocument, fileDocument, getDocument, listDocuments } from './data'
import type { CreateDocumentInput } from './schema'

export const documentsOptions = (status = '') => queryOptions({ queryKey: ['documents', 'list', status] as const, queryFn: () => listDocuments(status) })
export const documentOptions = (id: string) => queryOptions({ queryKey: ['documents', 'detail', id] as const, queryFn: () => getDocument(id) })

export const useDocuments = (status = '') => useSuspenseQuery(documentsOptions(status))
export const useDocument = (id: string) => useSuspenseQuery(documentOptions(id))

export const useCreateDocument = () => useMutation({ mutationFn: (input: CreateDocumentInput) => createDocument(input) })
export const useDiscardDocument = () => useMutation({ mutationFn: (id: string) => discardDocument(id) })
export const useFileDocument = () => useMutation({ mutationFn: (v: { id: string; filedOn: number; filedWith: string | null }) => fileDocument(v.id, { filedOn: v.filedOn, filedWith: v.filedWith }) })
