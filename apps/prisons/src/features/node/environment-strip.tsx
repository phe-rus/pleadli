import { ApiError, isNodeReachable, onReachabilityChange } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useDisconnectFromNode, useEnvironment, useLocalConnection } from './queries'
import { headOfficeLabel } from './schema'

function useNodeReachable() {
  return useSyncExternalStore(onReachabilityChange, isNodeReachable, () => true)
}

/**
 * The connection state, always in words and never optimistic
 * (docs/prisons/product-map/03 L.2): what this machine is (alone, the
 * facility's node, or a workstation), what Head Office contact really is,
 * and whether backups are overdue.
 */
export function EnvironmentStrip() {
  const { data } = useEnvironment()
  const { data: local } = useLocalConnection()
  const reachable = useNodeReachable()
  if (!data) return null

  const machine =
    local?.mode === 'client'
      ? reachable
        ? 'Workstation of the facility node'
        : 'Cannot reach the facility server'
      : data.network.mode === 'node'
        ? `Facility node · ${data.network.activeDevices} workstation${data.network.activeDevices === 1 ? '' : 's'}${data.network.listening ? '' : ' · not listening'}`
        : 'This computer only'
  const hq = data.headOffice.status

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
      <Badge variant={reachable ? 'secondary' : 'destructive'}>{machine}</Badge>
      <Badge variant={hq === 'connected' ? 'default' : hq === 'unpaired' ? 'secondary' : hq === 'behind' ? 'secondary' : 'destructive'}>
        {headOfficeLabel(hq)}
      </Badge>
      {data.backup.configured ? (
        data.backup.overdue && <Badge variant="destructive">Backup overdue</Badge>
      ) : (
        <Badge variant="destructive">No backups set up</Badge>
      )}
    </div>
  )
}

/** Shown across the top of a workstation while its facility node does not
 * answer. Nothing is lost: the records are on the node. */
export function NodeUnreachableBanner() {
  const reachable = useNodeReachable()
  const queryClient = useQueryClient()
  const disconnect = useDisconnectFromNode()
  const { data: local } = useLocalConnection()
  if (reachable || local?.mode !== 'client') return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs">
      <span>
        <strong>Cannot reach the facility server.</strong> Records are safe on the server. Continue on paper and enter them afterwards.
      </span>
      <span className="flex gap-2">
        <Button size="xs" variant="secondary" onClick={() => queryClient.invalidateQueries()}>
          Try again
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={disconnect.isPending}
          onClick={() =>
            disconnect.mutate(undefined, { onError: (error) => t.error('Could not disconnect', { description: error instanceof ApiError ? error.message : undefined }) })
          }
        >
          Use a different node
        </Button>
      </span>
    </div>
  )
}
