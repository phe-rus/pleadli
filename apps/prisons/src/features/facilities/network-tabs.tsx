import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { ApiError } from '@/lib/api'
import { DisconnectFromHeadOffice, SharedWithHeadOffice, exchangeCopy, stateCopy, transportLabel, useConnectivityStatus } from '@/features/connectivity'
import { useCloudflareConfig, useProvisionCloudflareTunnel, useSaveCloudflareConfig } from '@/features/network'
import { useHqConfig, usePermissions } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Switch } from '@pleadli/ui/switch'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect } from 'react'
import { ConnectFlow } from './connect-flow'
import { ExchangePanel } from './exchange-panel'
import { useCancelConnection, useHqNetworkStatus, useHqReachability, usePeerSyncConfig, useRefreshConnection, useSetHqLan, useSyncNow } from './queries'
import { m } from '@/paraglide/messages'

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
  const { data: link } = useConnectivityStatus()

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
      <Badge variant={link && ['stalled', 'needs_attention', 'offline'].includes(link.state) ? 'destructive' : 'default'}>{link ? stateCopy[link.state].label : m.facilities_connected()}</Badge>
    ) : connection === 'revoked' ? (
      <Badge variant="destructive">{m.connectivity_revoked()}</Badge>
    ) : connection === 'pending' ? (
      <Badge variant="secondary">{m.facilities_waiting_for_approval()}</Badge>
    ) : connection === 'rejected' ? (
      <Badge variant="destructive">{m.facilities_not_approved()}</Badge>
    ) : (
      <Badge variant="secondary">{link?.state === 'disconnected' ? m.facilities_disconnected() : m.facilities_working_on_its_own()}</Badge>
    )

  const facilityDescription =
    connection === 'connected'
      ? config?.lastSyncStatus === 'pending_verification'
        ? m.facilities_registered_with_head_office_as_and({ facilityDisplayName: config.facilityDisplayName ?? m.facilities_this_facility_lower() })
        : config?.lastSyncStatus === 'rejected'
          ? (config.lastError ?? m.facilities_head_office_rejected_this_installation_a())
          : config?.facilityDisplayName
            ? m.facilities_connected_to_head_office_as({ name: config.facilityDisplayName })
            : m.facilities_connected_to_head_office()
      : connection === 'pending'
        ? config?.requestedByName
          ? m.facilities_request_made_by({ name: config.requestedByName, badge: config.requestedByBadge ?? '' })
          : m.facilities_request_pending()
        : connection === 'rejected' || connection === 'revoked'
          ? (config?.lastError ?? m.facilities_head_office_did_not_approve_the())
          : link?.state === 'disconnected' && link.disconnectedAt
            ? m.facilities_disconnected_from_head_office_on_local({ disconnectedAt: format(link.disconnectedAt, 'PPp') })
            : m.facilities_not_connected_to_a_head_office()

  const rows: SettingsRow[] = [{ key: 'facility', label: m.facilities_this_facility(), description: facilityDescription, control: statusBadge }]

  if (config?.hqHostname) {
    rows.push({
      key: 'hq',
      label: m.facilities_head_office_address(),
      description: (
        <span>
          <code>{config.hqHostname}</code>
          {reachability.data && (reachability.data.reachable ? m.facilities_answering_now() : m.facilities_not_answering_now())}
        </span>
      ),
      control: (
        <Button size="xs" variant="secondary" disabled={reachability.isPending} onClick={() => reachability.mutate()}>
          {reachability.isPending ? m.facilities_checking() : m.facilities_check()}
        </Button>
      ),
    })
  }

  if (connection === 'connected') {
    rows.push({
      key: 'sync',
      label: m.facilities_last_exchange(),
      description: link
        ? m.facilities_last_exchange_summary({
            lastExchange: link.lastExchangeAt ? format(link.lastExchangeAt, 'PPp') : m.facilities_not_yet(),
            state: stateCopy[link.state].label,
            pending: link.pending.total === 0 ? m.facilities_nothing_waiting() : m.facilities_n_waiting({ count: link.pending.total }),
            transport: transportLabel[link.transport],
          })
        : m.facilities_checked_every_minute_and_only_changes(),
      control: canManage ? (
        <Button
          size="xs"
          disabled={syncNow.isPending}
          onClick={() =>
            syncNow.mutate(undefined, {
              onSuccess: (result) => {
                if (result.status === 'ok') t.success(m.facilities_synced_records({ count: result.count ?? 'all' }))
                else if (result.status === 'pending_verification') t.info(m.facilities_waiting_for_head_office_verification())
                else t.error(m.facilities_head_office_did_not_accept_this())
              },
              onError: (error) => t.error(error.message || m.facilities_sync_failed()),
            })
          }
        >
          {syncNow.isPending ? m.facilities_syncing() : m.facilities_sync_now()}
        </Button>
      ) : null,
    })
    if (link) {
      rows.push({
        key: 'exchange-state',
        label: m.facilities_exchange_state(),
        description: [exchangeCopy[link.exchange.state], link.certificatePinned ? m.facilities_certificate_pinned() : null].filter(Boolean).join('. '),
        control: null,
      })
    }
    rows.push({
      key: 'roster',
      label: m.facilities_accounts_shared_with_head_office(),
      description: config?.rosterPushedAt
        ? m.facilities_account_s_last_sent_names_badge({ rosterCount: config.rosterCount ?? 0, rosterPushedAt: format(config.rosterPushedAt, 'PPp') })
        : m.facilities_not_sent_yet_sent_after_each(),
      control: null,
    })
  }

  if (config?.lastError && connection !== 'rejected' && connection !== 'revoked') {
    rows.push({ key: 'last-error', label: m.facilities_last_error(), description: config.lastError, control: null })
  }

  if (connection === 'pending' && canManage) {
    rows.push({
      key: 'pending-actions',
      label: m.facilities_request(),
      description: m.facilities_checked_automatically_while_this_page_is(),
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
                  if (next.connectionState === 'pending') t.info(m.facilities_still_waiting_for_head_office())
                  if (next.connectionState === 'connected') t.success(m.facilities_head_office_approved_the_connection())
                },
                onError: () => t.error(m.facilities_head_office_could_not_be_reached()),
              })
            }
          >
            {m.facilities_check_now()}
          </Button>
          <Button size="xs" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {m.facilities_cancel_request()}
          </Button>
        </div>
      ),
    })
  }

  if ((connection === 'rejected' || connection === 'revoked') && canManage) {
    rows.push({
      key: 'rejected-actions',
      label: m.facilities_try_again(),
      description: m.facilities_clears_this_request_so_you_can(),
      control: (
        <Button size="xs" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          {m.facilities_start_over()}
        </Button>
      ),
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsTable rows={rows} />

      {connection === 'connected' && <SharedWithHeadOffice canManage={canManage} />}
      {connection === 'connected' && canManage && <DisconnectFromHeadOffice />}

      {connection === 'none' &&
        (canManage && session ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3>{m.facilities_connect_to_head_office()}</h3>
              <p>
                {m.facilities_pick_this_facility_from_head_office()}
              </p>
            </div>
            <Card className="p-0">
              <CardContent className="py-4">
                <ConnectFlow
                  scope="network"
                  requester={{ badge: session.officer.badgeNumber, name: session.officer.name }}
                  lockRequester
                  onConnected={(name) => {
                    t.success(m.facilities_connected_as_2({ name }))
                    queryClient.invalidateQueries({ queryKey: ['systemState'] })
                    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
                  }}
                  onPending={() => {
                    t.info(m.facilities_request_sent_to_head_office())
                    queryClient.invalidateQueries({ queryKey: ['systemState'] })
                    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
                  }}
                />
              </CardContent>
            </Card>
          </section>
        ) : (
          <p>{m.facilities_an_administrator_of_this_facility_can()}</p>
        ))}
    </div>
  )
}

function HqNetworkTab() {
  const { data: status } = useHqNetworkStatus()
  const setLan = useSetHqLan()
  const cloudflareState = status?.cloudflare.state ?? 'not_configured'
  const provision = useProvisionCloudflareTunnel()
  const setUpTunnel = () =>
    provision.mutate(undefined, {
      onSuccess: ({ hostname, connector }) =>
        connector === 'running' ? t.success(m.facilities_tunnel_set_up({ hostname })) : t.warning(m.facilities_tunnel_set_up_no_connector({ hostname })),
      onError: (error) => t.error(m.facilities_could_not_set_up_the_tunnel(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() }),
    })

  const lanRows: SettingsRow[] = status
    ? [
        {
          key: 'lan',
          label: m.facilities_accept_facilities_on_this_network(),
          description: !status.lan.enabled
            ? m.facilities_lan_off_description()
            : status.lan.addresses.length === 0
              ? m.facilities_lan_no_address()
              : m.facilities_lan_reach_at({ addresses: status.lan.addresses.join(', ') }),
          control: (
            <Switch
              checked={status.lan.enabled}
              disabled={setLan.isPending}
              onCheckedChange={(enabled) => setLan.mutate(enabled, { onError: () => t.error(m.node_could_not_change_that()) })}
            />
          ),
        },
        {
          key: 'fingerprint',
          label: m.facilities_this_head_office_s_fingerprint(),
          description: m.facilities_fingerprint_help(),
          control: null,
          expanded: <code className="break-all">{status.lan.fingerprint ?? m.node_not_generated_yet()}</code>,
        },
      ]
    : []

  const rows: SettingsRow[] = [
    {
      key: 'local',
      label: m.facilities_tunnel_origin(),
      description: status
        ? status.local.listening
          ? m.facilities_local_listening({ address: status.local.address })
          : m.facilities_local_not_listening({ address: status.local.address })
        : m.facilities_checking(),
      control: status ? <Badge variant={status.local.listening ? 'default' : 'destructive'}>{status.local.listening ? m.facilities_listening() : m.facilities_not_listening()}</Badge> : null,
    },
    {
      key: 'cloudflare',
      label: m.facilities_cloudflare_tunnel(),
      description:
        cloudflareState === 'connected'
          ? m.facilities_reachable_from_outside({ hostname: status?.cloudflare.hostname ?? '' })
          : cloudflareState === 'configured_not_connected'
            ? status?.cloudflare.tunnelProvisioned
              ? status.cloudflare.connector === 'missing'
                ? m.facilities_tunnel_connector_missing({ hostname: status.cloudflare.hostname ?? '' })
                : status.cloudflare.connector === 'stopped'
                  ? m.facilities_tunnel_connector_stopped({ hostname: status.cloudflare.hostname ?? '' })
                  : m.facilities_a_tunnel_is_set_up_for({ hostname: status.cloudflare.hostname ?? '' })
              : m.facilities_credentials_are_saved_but_no_tunnel()
            : m.facilities_no_tunnel_is_configured_facilities_on(),
      control: (
        <span className="flex items-center gap-2">
          {status?.cloudflare.configured && (
            <Button size="xs" variant="secondary" disabled={provision.isPending} onClick={setUpTunnel}>
              {provision.isPending ? m.facilities_setting_up_the_tunnel() : status.cloudflare.tunnelProvisioned ? m.facilities_check_the_tunnel() : m.facilities_set_up_the_tunnel()}
            </Button>
          )}
          <Badge variant={cloudflareState === 'connected' ? 'default' : 'secondary'}>{cloudflareState === 'connected' ? m.facilities_connected() : m.facilities_not_connected()}</Badge>
        </span>
      ),
    },
    {
      key: 'requests',
      label: m.facilities_connection_requests(),
      description:
        (status?.pendingRequests ?? 0) > 0
          ? m.facilities_facility_request_s_waiting_for_a({ pendingRequests: status?.pendingRequests ?? 0 })
          : m.facilities_no_requests_waiting(),
      control: (
        <Button size="xs" variant="secondary" nativeButton={false} render={<Link to="/facilities" />}>
          {m.facilities_review()}
        </Button>
      ),
    },
  ]
  if (status) {
    rows.push({
      key: 'base',
      label: m.facilities_address_facilities_use(),
      description: <code>{status.publicBase}</code>,
      control: null,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      {lanRows.length > 0 && <SettingsTable rows={lanRows} />}
      <SettingsTable rows={rows} />
      <ExchangePanel />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3>{m.facilities_cloudflare_tunnel()}</h3>
          <p>
            {m.facilities_makes_this_head_office_reachable_from()}
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
        t.success(m.facilities_cloudflare_configuration_saved())
      } catch (error) {
        t.error(m.facilities_could_not_save_cloudflare_configuration(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
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
              label={m.facilities_api_token()}
              autoComplete="off"
              placeholder={config ? m.facilities_leave_blank_to_keep_the_current() : undefined}
            />
          )}
        </form.AppField>
        <div className="grid gap-3 sm:grid-cols-2">
          <form.AppField name="accountId">{(f) => <f.input label={m.facilities_account_id()} autoComplete="off" />}</form.AppField>
          <form.AppField name="domain">{(f) => <f.input label={m.facilities_domain()} autoComplete="off" placeholder={m.facilities_e_g_pleadli_com()} />}</form.AppField>
        </div>
        <form.AppField name="stationName">{(f) => <f.input label={m.facilities_station_name()} autoComplete="off" placeholder={m.facilities_e_g_hq()} />}</form.AppField>

        <form.Subscribe selector={(state) => [state.values.stationName, state.values.domain] as const}>
          {([stationName, domain]) => (
            <FieldDescription>{m.facilities_becomes({ address: `${stationName || 'station-name'}.${domain || 'pleadli.com'}` })}</FieldDescription>
          )}
        </form.Subscribe>
      </FieldGroup>

      <form.AppForm>
        <form.submit label={m.facilities_save_cloudflare_configuration()} />
      </form.AppForm>
    </form>
  )
}
