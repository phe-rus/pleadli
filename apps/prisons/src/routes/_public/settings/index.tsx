import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { DevRoleSwitch } from '@/components/dev-role-switch'
import { facilityStatusLabel, ownFacilityOptions, peerSyncConfigOptions, useOwnFacility, usePeerSyncConfig } from '@/features/facilities'
import { cloudflareConfigOptions, useCloudflareConfig, useSaveCloudflareConfig } from '@/features/network'
import { useHqConfig } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/settings/')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...peerSyncConfigOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...ownFacilityOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...cloudflareConfigOptions(), staleTime: 'static' }),
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
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="network" className="pt-4">
          <NetworkTab />
        </TabsContent>
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

/** A facility's own registration and connection to Head Office — read
 * only here, since registering happens once at first-launch onboarding
 * (`FacilityOnboardingGate`), not a Settings form. */
function FacilityNetworkTab() {
  const { data: facility } = useOwnFacility()
  const { data: config } = usePeerSyncConfig()

  const rows: SettingsRow[] = [
    {
      key: 'facility',
      label: facility?.name ?? 'This facility',
      description: facility
        ? facility.status === 'active'
          ? `Verified by Head Office.`
          : facility.status === 'revoked'
            ? 'Revoked by Head Office — this installation can no longer sync.'
            : "Pending Head Office verification. You can keep using the system — this doesn't block routine work."
        : 'Not yet registered.',
      control: facility && <Badge variant={facility.status === 'active' ? 'default' : facility.status === 'revoked' ? 'destructive' : 'secondary'}>{facilityStatusLabel(facility.status)}</Badge>,
    },
    {
      key: 'hq-connection',
      label: 'Head Office connection',
      description: config?.hqHostname
        ? `Reachable at ${config.hqHostname}. ${config.lastSyncedAt ? `Last synced ${format(config.lastSyncedAt, 'PPp')}.` : 'Never synced yet.'}`
        : 'No Head Office reach configured yet — syncing prisoner records isn\'t available in this build.',
      control: null,
    },
  ]

  if (config?.lastError) {
    rows.push({
      key: 'last-error',
      label: 'Last sync error',
      description: config.lastError,
      control: null,
    })
  }

  return <SettingsTable rows={rows} className="md:max-w-lg" />
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
