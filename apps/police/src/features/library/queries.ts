import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addLibraryFiles, createLibraryFolder, deleteLibraryItem, emptyBin, importIntoLibrary, listBin, listLibrary, moveLibraryItem, purgeFromBin, renameLibraryItem, restoreFromBin, searchLibrary } from './data'

export const libraryKey = ['library'] as const

export const libraryFolderOptions = (folderId: string) => queryOptions({ queryKey: [...libraryKey, 'folder', folderId], queryFn: () => listLibrary(folderId) })
export const librarySearchOptions = (query: string) => queryOptions({ queryKey: [...libraryKey, 'search', query], queryFn: () => searchLibrary(query), enabled: query.trim().length > 0 })

/** Not suspended, and the folder just left stays on screen while the next loads. */
export function useLibraryFolder(folderId: string) {
  return useQuery({ ...libraryFolderOptions(folderId), placeholderData: keepPreviousData })
}
export function useLibrarySearch(query: string) {
  return useQuery({ ...librarySearchOptions(query), placeholderData: keepPreviousData })
}

/** Every change to the library refreshes every folder and search on screen. */
function useChanged<A, R>(fn: (arg: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: libraryKey }) })
}
export const useCreateFolder = () => useChanged((a: { parentId: string; name: string }) => createLibraryFolder(a.parentId, a.name))
export const useRenameItem = () => useChanged((a: { entry: Parameters<typeof renameLibraryItem>[0]; name: string }) => renameLibraryItem(a.entry, a.name))
export const useMoveItem = () => useChanged((a: { entry: Parameters<typeof moveLibraryItem>[0]; destinationId: string }) => moveLibraryItem(a.entry, a.destinationId))
export const useDeleteItem = () => useChanged((entry: Parameters<typeof deleteLibraryItem>[0]) => deleteLibraryItem(entry))
export const useImport = () =>
  useChanged((a: { folderId: string; paths?: string[]; files?: File[] }) => (a.files ? addLibraryFiles(a.folderId, a.files) : importIntoLibrary(a.folderId, a.paths ?? [])))

export const binOptions = () => queryOptions({ queryKey: [...libraryKey, 'bin'], queryFn: listBin })
export const useBin = () => useQuery({ ...binOptions(), placeholderData: keepPreviousData })
export const useRestore = () => useChanged((entry: Parameters<typeof restoreFromBin>[0]) => restoreFromBin(entry))
export const usePurge = () => useChanged((entry: Parameters<typeof purgeFromBin>[0]) => purgeFromBin(entry))
export const useEmptyBin = () => useChanged(() => emptyBin())
