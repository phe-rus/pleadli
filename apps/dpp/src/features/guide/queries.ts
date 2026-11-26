import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveOffence, createOffence, listGuide, listVersions, restoreStarter, restoreVersion, updateOffence, type OffenceInput } from './data'

export const useGuide = (jurisdiction: string | undefined) => useQuery({ queryKey: ['guide', jurisdiction] as const, queryFn: () => listGuide(jurisdiction!), enabled: !!jurisdiction })
export const useVersions = (id: string | null) => useQuery({ queryKey: ['guide-versions', id] as const, queryFn: () => listVersions(id!), enabled: !!id })

function useChanged() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: ['guide'] }), queryClient.invalidateQueries({ queryKey: ['guide-versions'] })])
}
export const useCreateOffence = () => useMutation({ mutationFn: (i: OffenceInput) => createOffence(i), onSuccess: useChanged() })
export const useUpdateOffence = () => useMutation({ mutationFn: ({ id, input }: { id: string; input: OffenceInput }) => updateOffence(id, input), onSuccess: useChanged() })
export const useArchiveOffence = () => useMutation({ mutationFn: (id: string) => archiveOffence(id), onSuccess: useChanged() })
export const useRestoreVersion = () => useMutation({ mutationFn: (versionId: string) => restoreVersion(versionId), onSuccess: useChanged() })
export const useRestoreStarter = () => useMutation({ mutationFn: (id: string) => restoreStarter(id), onSuccess: useChanged() })
