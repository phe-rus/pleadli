import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  acknowledgeBackupAlert,
  createOfficer,
  endBackupAlert,
  listActiveBackupAlerts,
  listBackupAlerts,
  listOfficers,
  listRemoteAccessLog,
  respondToBackupAlert,
  updateOfficer,
} from './data'
import type { CreateOfficerInput, UpdateOfficerInput } from './schema'

export const officersOptions = () =>
  queryOptions({
    queryKey: ['officers'] as const,
    queryFn: () => listOfficers(),
  })

export function useOfficers() {
  return useSuspenseQuery(officersOptions())
}

export function useCreateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOfficerInput) => createOfficer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useUpdateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOfficerInput }) => updateOfficer(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export const remoteAccessLogOptions = () =>
  queryOptions({
    queryKey: ['remoteAccessLog'] as const,
    queryFn: () => listRemoteAccessLog(),
  })

export function useRemoteAccessLog() {
  return useSuspenseQuery(remoteAccessLogOptions())
}

export const backupAlertsOptions = () =>
  queryOptions({
    queryKey: ['backupAlerts'] as const,
    queryFn: () => listBackupAlerts(),
  })

export function useBackupAlerts() {
  return useSuspenseQuery(backupAlertsOptions())
}

export function useAcknowledgeBackupAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => acknowledgeBackupAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupAlerts'] })
    },
  })
}

export const activeBackupAlertsOptions = () =>
  queryOptions({
    queryKey: ['backupAlerts', 'active'] as const,
    queryFn: () => listActiveBackupAlerts(),
  })

export function useActiveBackupAlerts() {
  return useQuery(activeBackupAlertsOptions())
}

export function useRespondToBackupAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, officerId }: { id: string; officerId: string }) => respondToBackupAlert(id, officerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupAlerts'] })
    },
  })
}

export function useEndBackupAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => endBackupAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupAlerts'] })
    },
  })
}
