import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activateLicence, backUpNow, cancelRestore, checkStorage, chooseOffice, contactNow, getOrchestra, sendPapers, stageRestore } from './data'

export const orchestraOptions = () =>
  queryOptions({
    queryKey: ['orchestra'] as const,
    queryFn: () => getOrchestra(),
    // The bar follows the day; a backup in progress is watched more closely.
    refetchInterval: (query) => (query.state.data?.backup.running ? 3_000 : 5 * 60_000),
  })

export function useOrchestra() {
  return useQuery(orchestraOptions())
}

function useOrchestraMutation<I, O>(fn: (input: I) => Promise<O>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['orchestra'] }),
  })
}

export const useContactNow = () => useOrchestraMutation((_: void) => contactNow())
export const useActivateLicence = () => useOrchestraMutation((key: string) => activateLicence(key))
export const useChooseOffice = () => useOrchestraMutation((address: string) => chooseOffice(address))
export const useBackUpNow = () => useOrchestraMutation((_: void) => backUpNow())
export const useCheckStorage = () => useOrchestraMutation((id: string) => checkStorage(id))
export const useSendPapers = () => useOrchestraMutation((_: void) => sendPapers())
export const useStageRestore = () => useOrchestraMutation((input: { path: string; phrase: string }) => stageRestore(input.path, input.phrase))
export const useCancelRestore = () => useOrchestraMutation((_: void) => cancelRestore())
