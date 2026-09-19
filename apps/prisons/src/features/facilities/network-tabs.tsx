import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { ApiError } from '@/lib/api'
import { useCloudflareConfig, useSaveCloudflareConfig } from '@/features/network'
import { useHqConfig, usePermissions } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect } from 'react'
import { ConnectFlow } from './connect-flow'
import { useCancelConnection, useHqNetworkStatus, useHqReachability, usePeerSyncConfig, useRefreshConnection, useSyncNow } from './queries'
import { syncStatusLabel } from './schema'

/** Settings > Network and sync. What it shows depends on what this
 * installation is: a facility shows its own link to Head Office, Head Office
 * shows how reachable it is and who is waiting to connect. */
export function NetworkTab() {
  const { data: hqConfig } = useHqConfig()
  return hqConfig?.isHeadOffice ? <HqNetworkTab /> : <FacilityNetworkTab />
}

function FacilityNetworkTab() {
  const { can, session } = usePermissions()
  const { data: config } = usePeerSyncConfig()
  const queryClient = useQueryClient()
  const syncNow = useSyncNow()
  const refresh = useRefreshConnection('network')
  const cancel = useCancelConnection('network')
  const reachability = useHqReachability()

  const connection = config?.connectionState ?? 'none'
  const canManage = can('node.manage')

  // A request Head Office has not decided yet: ask again while this page is open.
  useEffect(() => {
    if (connection !== 'pending' || !canManage) return
    const timer = setInterval(() => refresh.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['systemState'] }) }), 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, canManage])

  const statusBadge =
    connection === 'connected' ? (
      <Badge variant={config?.lastSyncStatus === 'rejected' || config?.lastSyncStatus === 'error' ? 'destructive' : 'default'}>Connected</Badge>
    ) : connection === 'pending' ? (
      <Badge variant="secondary">Waiting for approval</Badge>
    ) : connection === 'rejected' ? (
      <Badge variant="destructive">Not approved</Badge>
    ) : (
      <Badge variant="secondary">Working on its own</Badge>
    )

  const facilityDescription =
    connection === 'connected'
      ? config?.lastSyncStatus === 'pending_verification'
        ? `Registered with Head Office as ${config.facilityDisplayName ?? 'this facility'} and waiting for its verification. Using the system is not blocked.`
        : config?.lastSyncStatus === 'rejected'
          ? (config.lastError ?? 'Head Office rejected this installation. Ask it to reconnect you.')
          : `Connected to Head Office${config?.facilityDisplayName ? ` as ${config.facilityDisplayName}` : ''}.`
      : connection === 'pending'
        ? `Head Office has your request${config?.requestedByName ? `, made by ${config.requestedByName} (${config.requestedByBadge})` : ''}. It approves or rejects it from its Facilities page. Local work is not blocked.`
        : connection === 'rejected'
          ? (config?.lastError ?? 'Head Office did not approve the request.')
          : 'Not connected to a Head Office. Everything works fully offline. Connect when you are ready.'

  const rows: SettingsRow[] = [{ key: 'facility', label: 'This facility', description: facilityDescription, control: statusBadge }]

  if (config?.hqHostname) {
    rows.push({
      key: 'hq',
      label: 'Head Office address',
      description: (
        <span>
          <span className="font-mono">{config.hqHostname}</span>
          {reachability.data && (reachability.data.reachable ? '. Answering just now.' : '. Did not answer just now.')}
        </span>
      ),
      control: (
        <Button size="xs" variant="secondary" disabled={reachability.isPending} onClick={() => reachability.mutate()}>
          {reachability.isPending ? 'Checking…' : 'Check'}
        </Button>
      ),
    })
  }

  if (connection === 'connected') {
    rows.push({
      key: 'sync',
      label: 'Last sync',
      description: `${config?.lastSyncedAt ? format(config.lastSyncedAt, 'PPp') : 'Never synced'} · ${syncStatusLabel(config?.lastSyncStatus ?? null)}. Sends automatically every five minutes while online.`,
      control: canManage ? (
        <Button
          size="xs"
          disabled={syncNow.isPending}
          onClick={() =>
            syncNow.mutate(undefined, {
              onSuccess: (result) => {
                if (result.status === 'ok') t.success(`Synced ${result.count ?? 'all'} records`)
                else if (result.status === 'pending_verification') t.info('Waiting for Head Office verification')
                else t.error('Head Office did not accept this sync')
              },
              onError: (error) => t.error(error.message || 'Sync failed'),
            })
          }
        >
          {syncNow.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      ) : null,
    })
    rows.push({
      key: 'roster',
      label: 'Accounts shared with Head Office',
      description: config?.rosterPushedAt
        ? `${config.rosterCount ?? 0} account(s), last sent ${format(config.rosterPushedAt, 'PPp')}. Names, badge numbers and roles only, never passwords.`
        : 'Not sent yet. Sent after each successful sync. Names, badge numbers and roles only, never passwords.',
      control: null,
    })
  }

  if (config?.lastError && connection !== 'rejected') {
    rows.push({ key: 'last-error', label: 'Last error', description: config.lastError, control: null })
  }

  if (connection === 'pending' && canManage) {
    rows.push({
      key: 'pending-actions',
      label: 'Request',
      description: 'Checked automatically while this page is open.',
      control: (
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            disabled={refresh.isPending}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: (next) => {
                  queryClient.invalidateQueries({ queryKey: ['systemState'] })
                  if (next.connectionState === 'pending') t.info('Still waiting for Head Office')
                  if (next.connectionState === 'connected') t.success('Head Office approved the connection')
                },
                onError: () => t.error('Head Office could not be reached'),
              })
            }
          >
            Check now
          </Button>
          <Button size="xs" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel request
          </Button>
        </div>
      ),
    })
  }

  if (connection === 'rejected' && canManage) {
    rows.push({
      key: 'rejected-actions',
      label: 'Try again',
      description: 'Clears this request so you can connect again, for example with an activation code.',
      control: (
        <Button size="xs" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          Start over
        </Button>
      ),
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsTable rows={rows} />

      {connection === 'none' &&
        (canManage && session ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Connect to Head Office</h2>
              <p className="text-xs text-muted-foreground md:max-w-lg">
                Pick this facility from Head Office's list. Connecting never blocks local work.
              </p>
            </div>
            <Card className="p-0 md:max-w-xl">
              <CardContent className="py-4">
                <ConnectFlow
                  scope="network"
                  requester={{ badge: session.officer.badgeNumber, name: session.officer.name }}
                  lockRequester
                  onConnected={(name) => {
                    t.success(`Connected as ${name}`)
                    queryClient.invalidateQueries({ queryKey: ['systemState'] })
                    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
                  }}
                  onPending={() => {
                    t.info('Request sent to Head Office')
                    queryClient.invalidateQueries({ queryKey: ['systemState'] })
                    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
                  }}
                />
              </CardContent>
            </Card>
          </section>
        ) : (
          <p className="text-xs text-muted-foreground">An administrator of this facility can connect it to Head Office.</p>
        ))}
    </div>
  )
}

function HqNetworkTab() {
  const { data: status } = useHqNetworkStatus()
  const cloudflareState = status?.cloudflare.state ?? 'not_configured'

  const rows: SettingsRow[] = [
    {
      key: 'local',
      label: 'Local network',
      description: status
        ? `This machine ${status.local.listening ? 'is listening' : 'is not listening'} on ${status.local.address}. Facilities on this computer or its local network can connect now.`
        : 'Checking…',
      control: status ? <Badge variant={status.local.listening ? 'default' : 'destructive'}>{status.local.listening ? 'Listening' : 'Not listening'}</Badge> : null,
    },
    {
      key: 'cloudflare',
      label: 'Cloudflare Tunnel',
      description:
        cloudflareState === 'connected'
          ? `Reachable from outside at https://${status?.cloudflare.hostname}.`
          : cloudflareState === 'configured_not_connected'
            ? status?.cloudflare.tunnelProvisioned
              ? `A tunnel is set up for ${status.cloudflare.hostname}, but it did not answer just now, so facilities elsewhere cannot reach this Head Office.`
              : 'Credentials are saved, but no tunnel is running, so facilities elsewhere cannot reach this Head Office. Saving credentials does not start one.'
            : 'No tunnel is configured. Facilities on other networks cannot reach this Head Office yet.',
      control: <Badge variant={cloudflareState === 'connected' ? 'default' : 'secondary'}>{cloudflareState === 'connected' ? 'Connected' : 'Not connected'}</Badge>,
    },
    {
      key: 'requests',
      label: 'Connection requests',
      description:
        (status?.pendingRequests ?? 0) > 0
          ? `${status?.pendingRequests} facility request(s) waiting for a decision.`
          : 'No requests waiting.',
      control: (
        <Button size="xs" variant="secondary" nativeButton={false} render={<Link to="/facilities" />}>
          Review
        </Button>
      ),
    },
  ]
  if (status) {
    rows.push({
      key: 'base',
      label: 'Address facilities use',
      description: <span className="font-mono">{status.publicBase}</span>,
      control: null,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsTable rows={rows} />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Cloudflare Tunnel</h2>
          <p className="text-xs text-muted-foreground md:max-w-lg">
            Makes this Head Office reachable from anywhere. These are the credentials the tunnel will use; saving them does not start a
            tunnel by itself.
          </p>
        </div>
        <CloudflareForm />
      </section>
    </div>
  )
}

function CloudflareForm() {
  const { data: config } = useCloudflareConfig()
  const saveConfig = useSaveCloudflareConfig()

  const form = useAppForm({
    defaultValues: {
      apiToken: '',
      accountId: config?.accountId ?? '',
      domain: config?.domain ?? '',
      stationName: config?.stationName ?? '',
    },
    onSubmit: async ({ value }) => {
      try {
        await saveConfig.mutateAsync(value)
        t.success('Cloudflare configuration saved')
      } catch (error) {
        t.error('Could not save Cloudflare configuration', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4 md:max-w-xl"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="apiToken">
          {(f) => (
            <f.input
              type="password"
              label="API token"
              autoComplete="off"
              placeholder={config ? 'Leave blank to keep the current token' : undefined}
            />
          )}
        </form.AppField>
        <div className="grid gap-3 sm:grid-cols-2">
          <form.AppField name="accountId">{(f) => <f.input label="Account ID" autoComplete="off" />}</form.AppField>
          <form.AppField name="domain">{(f) => <f.input label="Domain" autoComplete="off" placeholder="e.g. pleadli.com" />}</form.AppField>
        </div>
        <form.AppField name="stationName">{(f) => <f.input label="Station name" autoComplete="off" placeholder="e.g. hq" />}</form.AppField>

        <form.Subscribe selector={(state) => [state.values.stationName, state.values.domain] as const}>
          {([stationName, domain]) => (
            <FieldDescription>Becomes {stationName || 'station-name'}.{domain || 'pleadli.com'}</FieldDescription>
          )}
        </form.Subscribe>
      </FieldGroup>

      <form.AppForm>
        <form.submit label="Save Cloudflare configuration" />
      </form.AppForm>
    </form>
  )
}
