import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createComment, listCommentsForEntity } from './data'
import type { CreateCommentInput } from './schema'

export const commentsForEntityOptions = (entityType: string, entityId: string) =>
  queryOptions({
    queryKey: ['comments', entityType, entityId] as const,
    queryFn: () => listCommentsForEntity(entityType, entityId),
    enabled: Boolean(entityId),
  })

export function useCommentsForEntity(entityType: string, entityId: string) {
  return useQuery(commentsForEntityOptions(entityType, entityId))
}

export function useCreateComment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreateCommentInput, 'entityType' | 'entityId'>) =>
      createComment({ ...input, entityType, entityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] })
    },
  })
}
