import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bulkImport,
  exportAllDocument,
  exportAllMarkdown,
  exportAllXlsx,
  getImportFields,
  parseImportFile,
  resolveCases,
  resolvePeople,
} from './data'

export function useExportAllMarkdown() {
  return useMutation({ mutationFn: exportAllMarkdown })
}

export function useExportAllXlsx() {
  return useMutation({ mutationFn: exportAllXlsx })
}

export function useExportAllDocument() {
  return useMutation({ mutationFn: exportAllDocument })
}

export const importFieldsOptions = (entityType: string) =>
  queryOptions({
    queryKey: ['data-io', 'import-fields', entityType] as const,
    queryFn: () => getImportFields(entityType),
    enabled: Boolean(entityType),
  })

export function useImportFields(entityType: string) {
  return useQuery(importFieldsOptions(entityType))
}

export function useParseImportFile() {
  return useMutation({ mutationFn: parseImportFile })
}

export function useResolvePeople() {
  return useMutation({ mutationFn: resolvePeople })
}

export function useResolveCases() {
  return useMutation({ mutationFn: resolveCases })
}

/** A bulk import can create any of a dozen record types at once, so
 * rather than maintain a per-entity-type query-key map here (guaranteed
 * to drift as new types are added), a successful import just invalidates
 * everything. This is a rare, deliberate action, not a hot path. */
export function useBulkImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ entityType, rows }: { entityType: string; rows: Record<string, string>[] }) => bulkImport(entityType, rows),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}
