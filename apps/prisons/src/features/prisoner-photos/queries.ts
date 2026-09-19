import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listPrisonerPhotos, savePrisonerPhoto } from './data'
import type { PhotoView } from './schema'

export const prisonerPhotosOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['prisoner-photos', prisonerId] as const,
    queryFn: () => listPrisonerPhotos(prisonerId),
    enabled: Boolean(prisonerId),
    staleTime: 60_000,
  })

export function usePrisonerPhotosQuery(prisonerId: string) {
  return useQuery(prisonerPhotosOptions(prisonerId))
}

/** The prisoner's current photos; `data` is an empty list until loaded. */
export function usePrisonerPhotos(prisonerId: string) {
  const query = usePrisonerPhotosQuery(prisonerId)
  return { ...query, data: query.data ?? [] }
}

/** With a fixed `view`, mutate with the data URL alone; without one, mutate with `{ view, dataUrl }`. */
export function useSavePrisonerPhoto(prisonerId: string, fixedView?: PhotoView) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: string | { view: PhotoView; dataUrl: string }) =>
      typeof input === 'string' ? savePrisonerPhoto(prisonerId, fixedView as PhotoView, input) : savePrisonerPhoto(prisonerId, input.view, input.dataUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prisoner-photos', prisonerId] }),
  })
}
