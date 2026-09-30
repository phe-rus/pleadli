import { queryOptions, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { addParty, closeMatter, createMatter, findConflicts, getMatter, listMatters, removeParty, reopenMatter, savePlea, setStage, updateMatter, updateParty, type PleaInput } from './data'
import type { MatterInput, MatterViewId, PartyInput } from './schema'

export const mattersOptions = (view: MatterViewId | '' = 'open', query = '', type = '') =>
  queryOptions({ queryKey: ['matters', 'list', view, query, type] as const, queryFn: () => listMatters(view, query, type) })
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
export const useSetStage = () => useMutation({ mutationFn: (v: { id: string; stage: string }) => setStage(v.id, v.stage) })
export const useAddParty = () => useMutation({ mutationFn: (v: { matterId: string; input: PartyInput }) => addParty(v.matterId, v.input) })
export const useUpdateParty = () => useMutation({ mutationFn: (v: { id: string; input: PartyInput }) => updateParty(v.id, v.input) })
export const useRemoveParty = () => useMutation({ mutationFn: (id: string) => removeParty(id) })

/** The conflict check, as a name is typed. Words shorter than three letters say nothing, so it waits for them. */
export const useConflicts = (name: string, exceptMatter?: string) =>
  useQuery({ queryKey: ['conflicts', name.trim().toLowerCase(), exceptMatter ?? ''] as const, queryFn: () => findConflicts(name.trim(), exceptMatter), enabled: name.trim().length >= 3, staleTime: 5_000 })
