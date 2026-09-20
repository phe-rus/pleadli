import { ApiError, isNodeReachable, onReachabilityChange } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useDisconnectFromNode, useEnvironment, useLocalConnection } from './queries'
import { headOfficeLabel } from './schema'
import { m } from '@/paraglide/messages'

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
        ? m.node_workstation_of_the_facility_node()
        : m.node_cannot_reach_the_facility_server_2()
      : data.network.mode === 'node'
        ? `${data.network.activeDevices === 1 ? m.node_facility_node_summary_one() : m.node_facility_node_summary({ count: data.network.activeDevices })}${data.network.listening ? '' : m.node_not_listening_suffix()}`
        : m.node_this_computer_only()
  const hq = data.headOffice.status

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
      <Badge variant={reachable ? 'secondary' : 'destructive'}>{machine}</Badge>
      <Badge variant={hq === 'connected' ? 'default' : hq === 'unpaired' ? 'secondary' : hq === 'behind' ? 'secondary' : 'destructive'}>
        {headOfficeLabel(hq)}
      </Badge>
      {data.backup.configured ? (
        data.backup.overdue && <Badge variant="destructive">{m.node_backup_overdue()}</Badge>
      ) : (
        <Badge variant="destructive">{m.node_no_backups_set_up()}</Badge>
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
        <strong>{m.node_cannot_reach_the_facility_server()}</strong> {m.node_records_are_safe_on_the_server()}
      </span>
      <span className="flex gap-2">
        <Button size="xs" variant="secondary" onClick={() => queryClient.invalidateQueries()}>
          {m.node_try_again()}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={disconnect.isPending}
          onClick={() =>
            disconnect.mutate(undefined, { onError: (error) => t.error(m.node_could_not_disconnect(), { description: error instanceof ApiError ? error.message : undefined }) })
          }
        >
          {m.node_use_a_different_node()}
        </Button>
      </span>
    </div>
  )
}
