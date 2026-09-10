import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createChargeSheet, listChargeSheets, updateChargeSheet } from './data'
import type { CreateChargeSheetInput } from './schema'

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chargeSheets'] })
    },
  })
}

export function useUpdateChargeSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateChargeSheetInput }) => updateChargeSheet(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chargeSheets'] })
    },
  })
}
