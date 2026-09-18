import { useMutation, useQueryClient } from '@tanstack/react-query'
import { receivePerson } from './data'
import type { ReceptionDraft } from './schema'

export function useReceivePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: ReceptionDraft) => receivePerson(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prisoners'] })
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['legal'] })
    },
  })
}
