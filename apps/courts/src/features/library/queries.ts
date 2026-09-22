import { queryOptions, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { addLibraryItem, getLibraryItem, listLibrary, removeLibraryItem, updateLibraryItem } from './data'
import type { LibraryInput } from './schema'

export const libraryOptions = (query = '', kind = '') => queryOptions({ queryKey: ['library', 'list', kind, query] as const, queryFn: () => listLibrary(query, kind) })
export const libraryItemOptions = (id: string) => queryOptions({ queryKey: ['library', 'item', id] as const, queryFn: () => getLibraryItem(id) })

export const useLibrary = (query = '', kind = '') => useSuspenseQuery(libraryOptions(query, kind))
export const useLibraryItem = (id: string) => useSuspenseQuery(libraryItemOptions(id))
/** For the citation picker in a decision, which must not suspend the editor. */
export const useLibrarySearch = (query: string) => useQuery({ ...libraryOptions(query.trim()), enabled: query.trim().length > 0 })

export const useAddLibraryItem = () => useMutation({ mutationFn: (input: LibraryInput) => addLibraryItem(input) })
export const useUpdateLibraryItem = () => useMutation({ mutationFn: (v: { id: string; input: LibraryInput }) => updateLibraryItem(v.id, v.input) })
export const useRemoveLibraryItem = () => useMutation({ mutationFn: (id: string) => removeLibraryItem(id) })
