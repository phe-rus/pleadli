import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCase, exportCaseDocument, getCaseWorkspace, listCasePeople, listCases, updateCase } from './data'
import type { DocumentFormat } from './data'
import type { CreateCaseInput } from './schema'

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export function useUpdateCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCaseInput }) => updateCase(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export function useExportCaseDocument(id: string) {
  return useMutation({ mutationFn: (format: DocumentFormat) => exportCaseDocument(id, format) })
}
