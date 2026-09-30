import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmFileItems, createFileItem, deleteFileItem, listFileItems, updateFileItem, type FileItemChange, type NewFileItem } from './data'

export const fileItemsOptions = (fileId: string) => queryOptions({ queryKey: ['file-items', fileId] as const, queryFn: () => listFileItems(fileId) })
export const useFileItems = (fileId: string) => useQuery(fileItemsOptions(fileId))

function useRefresh(fileId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['file-items', fileId] })
}

export function useCreateFileItem(fileId: string) {
  const refresh = useRefresh(fileId)
  return useMutation({ mutationFn: (item: NewFileItem) => createFileItem(item), onSuccess: refresh })
}
export function useUpdateFileItem(fileId: string) {
  const refresh = useRefresh(fileId)
  return useMutation({ mutationFn: ({ id, change }: { id: string; change: FileItemChange }) => updateFileItem(id, change), onSuccess: refresh })
}
export function useDeleteFileItem(fileId: string) {
  const refresh = useRefresh(fileId)
  return useMutation({ mutationFn: (id: string) => deleteFileItem(id), onSuccess: refresh })
}
export function useConfirmFileItems(fileId: string) {
  const refresh = useRefresh(fileId)
  return useMutation({ mutationFn: () => confirmFileItems(fileId), onSuccess: refresh })
}
