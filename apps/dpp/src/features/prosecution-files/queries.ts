import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createProsecutionFile,
  getProsecutionFile,
  linkPersonToFile,
  listFilePeople,
  listIntakeQueue,
  listProsecutionFiles,
  unlinkPersonFromFile,
  updateProsecutionFile,
} from './data'
import type { CreateProsecutionFileInput, UpdateProsecutionFileInput } from './schema'

export const prosecutionFilesOptions = (query: string) =>
  queryOptions({
    queryKey: ['prosecution-files', 'list', query] as const,
    queryFn: () => listProsecutionFiles(query),
  })

export function useProsecutionFiles(query: string) {
  return useSuspenseQuery(prosecutionFilesOptions(query))
}

export const intakeQueueOptions = () =>
  queryOptions({
    queryKey: ['prosecution-files', 'intake'] as const,
    queryFn: () => listIntakeQueue(),
  })

export function useIntakeQueue() {
  return useSuspenseQuery(intakeQueueOptions())
}

export const prosecutionFileOptions = (id: string) =>
  queryOptions({
    queryKey: ['prosecution-files', 'detail', id] as const,
    queryFn: () => getProsecutionFile(id),
  })

export function useProsecutionFile(id: string) {
  return useSuspenseQuery(prosecutionFileOptions(id))
}

export const filePeopleOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['prosecution-files', 'people', prosecutionFileId] as const,
    queryFn: () => listFilePeople(prosecutionFileId),
  })

export function useFilePeople(prosecutionFileId: string) {
  return useSuspenseQuery(filePeopleOptions(prosecutionFileId))
}

function invalidateFileQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['prosecution-files'] })
}

export function useCreateProsecutionFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProsecutionFileInput) => createProsecutionFile(input),
    onSuccess: () => invalidateFileQueries(queryClient),
  })
}

export function useUpdateProsecutionFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProsecutionFileInput }) => updateProsecutionFile(id, input),
    onSuccess: () => invalidateFileQueries(queryClient),
  })
}

export function useLinkPersonToFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ prosecutionFileId, personId, role }: { prosecutionFileId: string; personId: string; role: string }) =>
      linkPersonToFile(prosecutionFileId, personId, role),
    onSuccess: () => invalidateFileQueries(queryClient),
  })
}

export function useUnlinkPersonFromFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unlinkPersonFromFile(id),
    onSuccess: () => invalidateFileQueries(queryClient),
  })
}
