import { queryOptions, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { addParty, concludeCase, createCase, getCase, listCases, removeParty, reopenCase, updateCase, updateParty } from './data'
import type { CaseInput, CaseViewId, PartyInput } from './schema'

export const casesOptions = (view: CaseViewId | '' = 'open', query = '') =>
  queryOptions({ queryKey: ['cases', 'list', view, query] as const, queryFn: () => listCases(view, query) })
export const caseOptions = (id: string) => queryOptions({ queryKey: ['cases', 'detail', id] as const, queryFn: () => getCase(id) })

export const useCases = (view: CaseViewId | '' = 'open', query = '') => useSuspenseQuery(casesOptions(view, query))
export const useCase = (id: string) => useSuspenseQuery(caseOptions(id))
/** For the command palette, which types before anything is ready. */
export const useCaseSearch = (query: string) => useQuery({ ...casesOptions('all', query.trim()), enabled: query.trim().length > 0 })

export const useCreateCase = () => useMutation({ mutationFn: (input: CaseInput) => createCase(input) })
export const useUpdateCase = () => useMutation({ mutationFn: (v: { id: string; input: CaseInput }) => updateCase(v.id, v.input) })
export const useConcludeCase = () => useMutation({ mutationFn: (v: { id: string; outcome: string }) => concludeCase(v.id, v.outcome) })
export const useReopenCase = () => useMutation({ mutationFn: (id: string) => reopenCase(id) })
export const useAddParty = () => useMutation({ mutationFn: (v: { caseId: string; input: PartyInput }) => addParty(v.caseId, v.input) })
export const useUpdateParty = () => useMutation({ mutationFn: (v: { id: string; input: PartyInput }) => updateParty(v.id, v.input) })
export const useRemoveParty = () => useMutation({ mutationFn: (id: string) => removeParty(id) })
