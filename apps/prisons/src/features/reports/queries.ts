import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { attestReturn, generateReport, getReport, getReportsSummary, getReturnChecks, listReceivedReturns, listReports, submitReturn } from './data'
import type { GeneratedReport, GenerateReportInput } from './schema'

export const reportsSummaryOptions = () =>
  queryOptions({
    queryKey: ['reports', 'summary'] as const,
    queryFn: () => getReportsSummary(),
  })

export const reportsOptions = () => queryOptions({ queryKey: ['reports', 'list'] as const, queryFn: () => listReports() })

export function useReports() {
  return useQuery(reportsOptions())
}

export const reportOptions = (id: string) => queryOptions({ queryKey: ['reports', 'one', id] as const, queryFn: () => getReport(id) })

export function useReport(id: string) {
  return useQuery(reportOptions(id))
}

export function useGenerateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GenerateReportInput) => generateReport(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
    },
  })
}

export const returnChecksOptions = (id: string) => queryOptions({ queryKey: ['reports', 'checks', id] as const, queryFn: () => getReturnChecks(id) })

export function useReturnChecks(id: string, enabled: boolean) {
  return useQuery({ ...returnChecksOptions(id), enabled })
}

/** Attesting and submitting change one report, so its cached copy, the list
 * and its checks are refreshed together. */
function useReturnStep(step: (id: string) => Promise<GeneratedReport>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: step,
    onSuccess: (report) => {
      queryClient.setQueryData(reportOptions(report.id).queryKey, report)
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['reports', 'checks', report.id] })
      queryClient.invalidateQueries({ queryKey: ['connectivity'] })
    },
  })
}

export function useAttestReturn() {
  return useReturnStep(attestReturn)
}

export function useSubmitReturn() {
  return useReturnStep(submitReturn)
}

export const receivedReturnsOptions = () => queryOptions({ queryKey: ['reports', 'received'] as const, queryFn: () => listReceivedReturns() })

export function useReceivedReturns(enabled: boolean) {
  return useQuery({ ...receivedReturnsOptions(), enabled })
}
