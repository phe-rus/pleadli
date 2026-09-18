import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addAttachment, listAttachments, voidAttachment, type PickedFile } from './data'

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
    mutationFn: (file: PickedFile) => addAttachment(entityType, entityId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}

export function useVoidAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidAttachment(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}
