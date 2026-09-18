import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createReviewNote, listReviewNotesForFile } from './data'
import type { CreateReviewNoteInput } from './schema'

export const reviewNotesForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['review-notes', 'file', prosecutionFileId] as const,
    queryFn: () => listReviewNotesForFile(prosecutionFileId),
  })

export function useReviewNotesForFile(prosecutionFileId: string) {
  return useSuspenseQuery(reviewNotesForFileOptions(prosecutionFileId))
}

export function useCreateReviewNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReviewNoteInput) => createReviewNote(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-notes', 'file', variables.prosecutionFileId] })
    },
  })
}
