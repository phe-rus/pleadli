import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addAttachmentFile, addAttachmentFromPath, deleteAttachment, listAttachments } from './data'

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
      'file' in input ? addAttachmentFile(entityType, entityId, input.file) : addAttachmentFromPath(entityType, entityId, input.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
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
