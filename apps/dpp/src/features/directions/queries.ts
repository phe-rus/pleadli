import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { listDirectionsForFile, respondToDirection } from './data'

export const directionsForFileOptions = (fileId: string) =>
  queryOptions({ queryKey: ['directions', fileId] as const, queryFn: () => listDirectionsForFile(fileId) })

export const useDirectionsForFile = (fileId: string) => useSuspenseQuery(directionsForFileOptions(fileId))

export const useRespondToDirection = () =>
  useMutation({ mutationFn: (v: { id: string; response: string; note: string }) => respondToDirection(v.id, v.response, v.note) })
