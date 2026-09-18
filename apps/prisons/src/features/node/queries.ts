import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectToNode,
  createEnrolmentCode,
  disconnectFromNode,
  getEnvironment,
  getLocalConnection,
  listDevices,
  revokeDevice,
  setNodeMode,
  getBackups,
  getRecoveryStatus,
  listRecoveryBackups,
  restoreBackup,
  restoreInRecovery,
  runBackup,
  saveBackupConfig,
  verifyBackup,
} from './data'
import type { ConnectToNodeInput, SaveBackupConfigInput } from './schema'

export function useRecoveryStatus() {
  return useQuery({ queryKey: ['recovery'] as const, queryFn: () => getRecoveryStatus(), retry: false, staleTime: Infinity })
}

export function useRecoveryBackups() {
  return useMutation({ mutationFn: (dir: string | null) => listRecoveryBackups(dir) })
}

export function useRestoreInRecovery() {
  return useMutation({ mutationFn: ({ path, passphrase }: { path: string; passphrase: string }) => restoreInRecovery(path, passphrase) })
}

export function backupsOptions() {
  return { queryKey: ['backups'] as const, queryFn: () => getBackups() }
}

export function useBackups(enabled = true) {
  return useQuery({ ...backupsOptions(), enabled })
}

export function useSaveBackupConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveBackupConfigInput) => saveBackupConfig(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useRunBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => runBackup(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useVerifyBackup() {
  return useMutation({ mutationFn: ({ path, passphrase }: { path: string; passphrase: string }) => verifyBackup(path, passphrase) })
}

export function useRestoreBackup() {
  return useMutation({ mutationFn: ({ path, passphrase }: { path: string; passphrase: string }) => restoreBackup(path, passphrase) })
}

export function useEnvironment(enabled = true) {
  return useQuery({ queryKey: ['environment'] as const, queryFn: () => getEnvironment(), enabled, refetchInterval: 15_000, retry: false })
}

export function useSetNodeMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serve, port }: { serve: boolean; port?: number }) => setNodeMode(serve, port),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environment'] })
    },
  })
}

export function useDevices(enabled = true) {
  return useQuery({ queryKey: ['devices'] as const, queryFn: () => listDevices(), enabled })
}

export function useCreateEnrolmentCode() {
  return useMutation({ mutationFn: (label: string) => createEnrolmentCode(label) })
}

export function useRevokeDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['environment'] })
    },
  })
}

export function useLocalConnection() {
  return useQuery({ queryKey: ['localConnection'] as const, queryFn: () => getLocalConnection(), retry: false })
}

export function useConnectToNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectToNodeInput) => connectToNode(input),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

export function useDisconnectFromNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => disconnectFromNode(),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}
