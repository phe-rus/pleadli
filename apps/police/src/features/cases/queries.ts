import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCase, exportCaseDocument, getCaseWorkspace, listCaseAccess, listCasePeople, listCases, updateCase } from './data'
import type { DocumentFormat } from './data'
import type { CreateCaseInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const casesList = { listKey: ['cases', 'list'], invalidate: [['cases']], sortBy: 'createdAt' } satisfies ListConfig

export const casesOptions = (query: string) =>
  queryOptions({
    queryKey: ['cases', 'list', query] as const,
    queryFn: () => listCases(query),
  })

export function useCases(query: string) {
  return useSuspenseQuery(casesOptions(query))
}

export const casePeopleOptions = (caseId: string) =>
  queryOptions({
    queryKey: ['cases', 'people', caseId] as const,
    queryFn: () => listCasePeople(caseId),
    enabled: Boolean(caseId),
  })

export function useCaseAccess(caseId: string, enabled: boolean) {
  return useQuery({ queryKey: ['cases', 'access', caseId] as const, queryFn: () => listCaseAccess(caseId), enabled: enabled && Boolean(caseId) })
}

export function useCasePeople(caseId: string) {
  return useQuery(casePeopleOptions(caseId))
}

export const caseWorkspaceOptions = (id: string) =>
  queryOptions({
    queryKey: ['cases', 'workspace', id] as const,
    queryFn: () => getCaseWorkspace(id),
  })

export function useCaseWorkspace(id: string) {
  return useSuspenseQuery(caseWorkspaceOptions(id))
}

export function useCreateCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCaseInput) => createCase(input),
    ...optimisticCreate(queryClient, casesList),
  })
}

export function useUpdateCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCaseInput }) => updateCase(id, input),
    ...optimisticUpdate(queryClient, casesList),
  })
}

export function useExportCaseDocument(id: string) {
  return useMutation({ mutationFn: (format: DocumentFormat) => exportCaseDocument(id, format) })
}
