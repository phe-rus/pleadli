import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { DevRoleSwitch } from '@/components/dev-role-switch'
import {
  PairWithHeadOfficeForm,
  peerSyncConfigOptions,
  syncStatusLabel,
  usePeerSyncConfig,
  useSyncNow,
} from '@/features/facilities'
import { cloudflareConfigOptions, useCloudflareConfig, useSaveCloudflareConfig } from '@/features/network'
import { BackupsPanel, NodePanel, backupsOptions } from '@/features/node'
import { useHqConfig, usePermissions } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/settings/')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  loader: async ({ context }) => {
    // Each of these needs a different permission, and the page renders
    // fine without any of them, so a refusal here is not an error.
    await Promise.allSettled([
      context.queryClient.query({ ...peerSyncConfigOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...cloudflareConfigOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...backupsOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/** Application configuration only — general preferences and network/sync
 * setup, not records (officer accounts have their own `/officers` page,
 * facility management has its own `/facilities` page). A Settings page
 * that just showed a table of accounts was the wrong shape: this page
 * answers "how is this installation configured," not "who is in it." */
function RouteComponent() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { can } = usePermissions()

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Settings</h1>
        <p className="md:max-w-lg">Application, network, and sync configuration for this installation.</p>
      </section>

      <Tabs
        value={tab ?? 'general'}
        onValueChange={(value) => navigate({ search: { tab: value === 'general' ? undefined : String(value) } })}
      >
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="network">Network & Sync</TabsTrigger>
          {can('node.manage') && <TabsTrigger value="node">Node and backups</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="network" className="pt-4">
          <NetworkTab />
        </TabsContent>
        {can('node.manage') && (
          <TabsContent value="node" className="pt-4">
            <div className="flex flex-col gap-10">
              <NodePanel />
              <BackupsPanel />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </article>
  )
}

function GeneralTab() {
  const rows: SettingsRow[] = [
    {
      key: 'appearance',
      label: 'Appearance',
      description: 'Light, dark, or match the system.',
      control: <Toggletheme />,
    },
  ]

  return (
    <div className="flex flex-col gap-6 md:max-w-lg">
      <SettingsTable rows={rows} />
      {import.meta.env.DEV && <DevRoleSwitch compact={false} />}
    </div>
  )
}

function NetworkTab() {
  const { data: hqConfig } = useHqConfig()
  return hqConfig?.isHeadOffice ? <HqNetworkTab /> : <FacilityNetworkTab />
}

/** A facility's own connection to Head Office. A facility works fully on
 * its own; pairing is optional and can be done here at any time. A paired
 * facility has no local `facilities` row of its own: the `peer_sync_config`
 * credential is its source of truth, and only Head Office holds the roster. */
function FacilityNetworkTab() {
  const { data: state } = useHqConfig()
  const { can } = usePermissions()
  const { data: config } = usePeerSyncConfig()
  const syncNow = useSyncNow()

  const paired = state?.paired ?? false
  const statusBadge = paired ? (
    <Badge variant={config?.lastSyncStatus === 'ok' ? 'default' : config?.lastSyncStatus === 'rejected' || config?.lastSyncStatus === 'error' ? 'destructive' : 'secondary'}>
      {config?.lastSyncStatus ? syncStatusLabel(config.lastSyncStatus) : 'Paired'}
    </Badge>
  ) : (
    <Badge variant="secondary">Working on its own</Badge>
  )

  const rows: SettingsRow[] = [
    {
      key: 'facility',
      label: 'This facility',
      description: paired
        ? config?.lastSyncStatus === 'pending_verification'
          ? 'Registered with Head Office and waiting for its verification. Using the system is not blocked.'
          : config?.lastSyncStatus === 'rejected'
            ? config?.lastError ?? 'Head Office rejected this installation. Reach out to re-pair.'
            : 'Paired with Head Office. It approves or revokes you from its Facilities page.'
        : 'Not paired with a Head Office. Everything works fully offline; pair when you have a pairing code.',
      control: statusBadge,
    },
    {
      key: 'hq-connection',
      label: 'Head Office connection',
      description: config?.hqHostname
        ? `Reachable at ${config.hqHostname}.${config?.lastSyncedAt ? ` Last synced ${format(config.lastSyncedAt, 'PPp')}.` : ''}`
        : 'No Head Office connection yet. Sync starts once you pair.',
      control: null,
    },
  ]

  if (config?.lastError) {
    rows.push({ key: 'last-error', label: 'Last sync error', description: config.lastError, control: null })
  }

  if (config?.hqHostname && paired && can('node.manage')) {
    rows.push({
      key: 'sync-now',
      label: 'Send to Head Office now',
      description: 'Normally sends automatically every five minutes while online; this sends immediately.',
      control: (
        <Button
          size="xs"
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
          disabled={syncNow.isPending}
        >
          {syncNow.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      ),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsTable rows={rows} className="md:max-w-lg" />
      {!paired && can('node.manage') && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Pair with Head Office</h2>
            <p className="text-xs text-muted-foreground md:max-w-lg">
              Head Office gives you a pairing code. Pairing lets this facility send what Head Office needs; it never blocks local work.
            </p>
          </div>
          <PairWithHeadOfficeForm />
        </div>
      )}
    </div>
  )
}

/** Head Office's own reach: the Cloudflare Tunnel config that will make
 * `hq_server.rs` reachable so facilities can register and sync (spec:
 * docs/specs/prisons/0001-head-office-peer-sync-network/0002-peer-
 * registration-and-pairing.md), ported from Police's identical form.
 * Saving credentials here is real; the network server they point at
 * (`hq_server.rs`) doesn't exist yet, so this is genuinely just
 * configuration storage until that lands. */
function HqNetworkTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Cloudflare Tunnel</h2>
        <p className="text-xs text-muted-foreground md:max-w-lg">
          Makes this Head Office reachable from anywhere, so facility installations can pair and sync with it.
        </p>
      </div>
      <CloudflareForm />
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
      } catch {
        t.error('Could not save Cloudflare configuration', { description: 'Please try again.' })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4 md:max-w-lg"
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
              placeholder={config ? 'Leave blank to keep the current token' : undefined}
            />
          )}
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="accountId">{(f) => <f.input label="Account ID" />}</form.AppField>
          <form.AppField name="domain">{(f) => <f.input label="Domain" placeholder="e.g. pleadli.com" />}</form.AppField>
        </div>
        <form.AppField name="stationName">{(f) => <f.input label="Station name" placeholder="e.g. hq" />}</form.AppField>

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
