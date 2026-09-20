import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getIssuedDocument, issueDocument } from './data'
import type { DocumentKind } from './schema'

export const issuedDocumentOptions = (kind: DocumentKind, recordId: string) => ({
  queryKey: ['documents', 'issued', kind, recordId] as const,
  queryFn: () => getIssuedDocument(kind, recordId),
})

export function useIssuedDocument(kind: DocumentKind, recordId: string, enabled = true) {
  return useQuery({ ...issuedDocumentOptions(kind, recordId), enabled, retry: false })
}

export function useIssueDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: issueDocument,
    onSuccess: (issued, { kind, recordId }) => queryClient.setQueryData(issuedDocumentOptions(kind, recordId).queryKey, issued),
  })
}
