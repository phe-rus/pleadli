import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  approveVisitor,
  createVisit,
  getVisitRules,
  listApprovedVisitors,
  listVisitItems,
  listVisits,
  listVisitsForPrisoner,
  runVisitAction,
  saveVisitRules,
  searchVisitors,
  setVisitorStatus,
  type VisitAction,
} from './data'
import type { CreateVisitInput, NewVisitorInput, SaveVisitRulesInput } from './schema'

export const visitsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['visits', 'prisoner', prisonerId] as const,
    queryFn: () => listVisitsForPrisoner(prisonerId),
  })

export function useVisitsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(visitsForPrisonerOptions(prisonerId))
}

export function usePrisonerVisits(prisonerId: string) {
  return useSuspenseQuery(visitsForPrisonerOptions(prisonerId))
}

export const allVisitsOptions = (query: string = '') =>
  queryOptions({
    queryKey: ['visits', 'all', query] as const,
    queryFn: () => listVisits(query),
  })

export function useVisits(query: string = '') {
  return useSuspenseQuery(allVisitsOptions(query))
}

export const visitRulesOptions = () =>
  queryOptions({
    queryKey: ['visits', 'rules'] as const,
    queryFn: () => getVisitRules(),
  })

export function useVisitRules() {
  return useSuspenseQuery(visitRulesOptions())
}

export function useVisitItems(visitId: string, enabled = true) {
  return useQuery({ queryKey: ['visits', 'items', visitId] as const, queryFn: () => listVisitItems(visitId), enabled })
}

export function useApprovedVisitors(prisonerId: string) {
  return useQuery({ queryKey: ['visits', 'approved', prisonerId] as const, queryFn: () => listApprovedVisitors(prisonerId) })
}

export function useVisitorSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({ queryKey: ['visits', 'visitors', trimmed] as const, queryFn: () => searchVisitors(trimmed), enabled: trimmed.length >= 2 })
}

function useInvalidateVisits() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['visits'] })
}

export function useCreateVisit() {
  const invalidate = useInvalidateVisits()
  return useMutation({ mutationFn: (input: CreateVisitInput) => createVisit(input), onSuccess: invalidate })
}

export function useVisitAction() {
  const invalidate = useInvalidateVisits()
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: VisitAction; body?: unknown }) => runVisitAction(id, action, body),
    onSuccess: invalidate,
  })
}

export function useSaveVisitRules() {
  const invalidate = useInvalidateVisits()
  return useMutation({ mutationFn: (input: SaveVisitRulesInput) => saveVisitRules(input), onSuccess: invalidate })
}

export function useApproveVisitor(prisonerId: string) {
  const invalidate = useInvalidateVisits()
  return useMutation({
    mutationFn: (input: { visitorId?: string; newVisitor?: NewVisitorInput; relationship?: string }) => approveVisitor(prisonerId, input),
    onSuccess: invalidate,
  })
}

export function useSetVisitorStatus(prisonerId: string) {
  const invalidate = useInvalidateVisits()
  return useMutation({
    mutationFn: ({ visitorId, status, note }: { visitorId: string; status: 'active' | 'suspended'; note?: string }) =>
      setVisitorStatus(prisonerId, visitorId, status, note),
    onSuccess: invalidate,
  })
}
