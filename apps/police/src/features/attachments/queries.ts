import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  addAttachmentFile,
  addAttachmentFromPath,
  deleteAttachment,
  getAttachmentRoute,
  listAllAttachments,
  listAttachments,
} from './data'

export const attachmentsOptions = (entityType: string, entityId: string) =>
  queryOptions({
    queryKey: ['attachments', entityType, entityId] as const,
    queryFn: () => listAttachments(entityType, entityId),
    enabled: Boolean(entityId),
  })

export function useAttachments(entityType: string, entityId: string) {
  return useQuery(attachmentsOptions(entityType, entityId))
}

export function useAddAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string } | { file: File }) =>
      'file' in input
        ? addAttachmentFile(entityType, entityId, input.file)
        : addAttachmentFromPath(entityType, entityId, input.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}

export const allAttachmentsOptions = (query: string) =>
  queryOptions({
    queryKey: ['attachments', 'all', query] as const,
    queryFn: () => listAllAttachments(query),
  })

export function useAllAttachments(query: string) {
  return useSuspenseQuery(allAttachmentsOptions(query))
}

export function useAttachmentRoute(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['attachments', 'route', entityType, entityId] as const,
    queryFn: () => getAttachmentRoute(entityType, entityId),
  })
}

export function useDeleteAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}
