import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  cancelTransfer,
  confirmArrival,
  dispatchTransfer,
  getDossierPreview,
  importDossier,
  importReceipt,
  listTransfers,
  listTransfersForPrisoner,
  prepareTransfer,
  saveChecklist,
} from './data'
import type { Checklist, ConfirmArrivalInput, DispatchTransferInput, PrepareTransferInput } from './schema'

export const transfersOptions = () =>
  queryOptions({
    queryKey: ['transfers', 'all'] as const,
    queryFn: () => listTransfers(),
  })

export function useTransfers() {
  return useSuspenseQuery(transfersOptions())
}

export const transfersForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['transfers', 'prisoner', prisonerId] as const,
    queryFn: () => listTransfersForPrisoner(prisonerId),
  })

export function useTransfersForPrisoner(prisonerId: string) {
  return useSuspenseQuery(transfersForPrisonerOptions(prisonerId))
}

export const dossierPreviewOptions = (id: string) =>
  queryOptions({
    queryKey: ['transfers', 'dossier', id] as const,
    queryFn: () => getDossierPreview(id),
  })

export function useDossierPreview(id: string) {
  return useSuspenseQuery(dossierPreviewOptions(id))
}

/** A transfer changes what Today owes, the person's status and their file. */
function useInvalidateTransferViews() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['transfers'] })
    queryClient.invalidateQueries({ queryKey: ['prisoners'] })
    queryClient.invalidateQueries({ queryKey: ['today'] })
  }
}

export function usePrepareTransfer() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: (input: PrepareTransferInput) => prepareTransfer(input), onSuccess: invalidate })
}

export function useSaveChecklist() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: ({ id, checklist }: { id: string; checklist: Checklist }) => saveChecklist(id, checklist), onSuccess: invalidate })
}

export function useDispatchTransfer() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: DispatchTransferInput }) => dispatchTransfer(id, input), onSuccess: invalidate })
}

export function useCancelTransfer() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelTransfer(id, reason), onSuccess: invalidate })
}

export function useImportDossier() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: (input: { contentBase64: string; passphrase: string }) => importDossier(input), onSuccess: invalidate })
}

export function useImportReceipt() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: (input: { contentBase64: string }) => importReceipt(input), onSuccess: invalidate })
}

export function useConfirmArrival() {
  const invalidate = useInvalidateTransferViews()
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: ConfirmArrivalInput }) => confirmArrival(id, input), onSuccess: invalidate })
}
