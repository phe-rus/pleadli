import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createProsecutionFile,
  getProsecutionFile,
  linkPersonToFile,
  listFilePeople,
  listFiles,
  unlinkPersonFromFile,
  updateProsecutionFile,
} from './data'
import type { CreateProsecutionFileInput, FileViewId, UpdateProsecutionFileInput } from './schema'

export const filesOptions = (view: FileViewId | 'awaiting', query = '') =>
  queryOptions({
    queryKey: ['prosecution-files', 'list', view, query] as const,
    queryFn: () => listFiles(view, query),
  })

export function useFiles(view: FileViewId | 'awaiting', query = '') {
  return useSuspenseQuery(filesOptions(view, query))
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
