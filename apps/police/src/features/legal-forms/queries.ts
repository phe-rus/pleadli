import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createChargeSheet, exportChargeSheetDocument, listChargeSheets, updateChargeSheet } from './data'
import type { DocumentFormat } from './data'
import type { CreateChargeSheetInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const legal_formsList = { listKey: ['chargeSheets', 'list'], invalidate: [['chargeSheets'], ['cases'], ['people', 'profile']], sortBy: 'chargedAt' } satisfies ListConfig

export const chargeSheetsOptions = (query: string) =>
  queryOptions({
    queryKey: ['chargeSheets', 'list', query] as const,
    queryFn: () => listChargeSheets(query),
  })

export function useChargeSheets(query: string) {
  return useSuspenseQuery(chargeSheetsOptions(query))
}

export function useCreateChargeSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChargeSheetInput) => createChargeSheet(input),
    ...optimisticCreate(queryClient, legal_formsList),
  })
}

export function useUpdateChargeSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateChargeSheetInput }) => updateChargeSheet(id, input),
    ...optimisticUpdate(queryClient, legal_formsList),
  })
}

export function useExportChargeSheetDocument(id: string) {
  return useMutation({ mutationFn: (format: DocumentFormat) => exportChargeSheetDocument(id, format) })
}
