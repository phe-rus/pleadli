import { queryOptions, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { closeMatter, createMatter, getMatter, listMatters, reopenMatter, savePlea, updateMatter, type PleaInput } from './data'
import type { MatterInput, MatterViewId } from './schema'

export const mattersOptions = (view: MatterViewId | '' = 'open', query = '') => queryOptions({ queryKey: ['matters', 'list', view, query] as const, queryFn: () => listMatters(view, query) })
export const matterOptions = (id: string) => queryOptions({ queryKey: ['matters', 'detail', id] as const, queryFn: () => getMatter(id) })

export const useMatters = (view: MatterViewId | '' = 'open', query = '') => useSuspenseQuery(mattersOptions(view, query))
export const useMatter = (id: string) => useSuspenseQuery(matterOptions(id))
/** For the command palette, which types before anything is ready. */
export const useMatterSearch = (query: string) => useQuery({ ...mattersOptions('all', query.trim()), enabled: query.trim().length > 0 })

export const useCreateMatter = () => useMutation({ mutationFn: (input: MatterInput) => createMatter(input) })
export const useUpdateMatter = () => useMutation({ mutationFn: (v: { id: string; input: MatterInput }) => updateMatter(v.id, v.input) })
export const useCloseMatter = () => useMutation({ mutationFn: (v: { id: string; outcome: string }) => closeMatter(v.id, v.outcome) })
export const useReopenMatter = () => useMutation({ mutationFn: (id: string) => reopenMatter(id) })
export const useSavePlea = () => useMutation({ mutationFn: (v: { matterId: string; input: PleaInput }) => savePlea(v.matterId, v.input) })
