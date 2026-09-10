import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { isCustodyAlertsEnabled, setCustodyAlertsEnabled } from '@/hooks/use-custody-deadline-alerts'
import { BulkFileIntake, ExportPanel, ImportWizard } from '@/features/data-io'
import { remoteAccessLogOptions, useRemoteAccessLog } from '@/features/officers'
import {
  cloudflareConfigOptions,
  localNetworkInfoOptions,
  remoteAccessStatusOptions,
  useCloudflareConfig,
  useCloudflareTunnelState,
  useLocalNetworkInfo,
  useLocalPairingQr,
  useRemoteAccessStatus,
  useSaveCloudflareConfig,
  useSetRemoteAccessEnabled,
} from '@/features/network'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/settings/')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...remoteAccessStatusOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...localNetworkInfoOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...cloudflareConfigOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remoteAccessLogOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function useAppInfo() {
  const [info, setInfo] = useState<{ version: string; platform: string; arch: string } | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    async function load() {
      const [{ platform, arch }, version] = await Promise.all([import('@tauri-apps/plugin-os'), getVersion()])
      if (!cancelled) setInfo({ version, platform: platform(), arch: arch() })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return info
}

function GeneralTab() {
  const [alertsEnabled, setAlertsEnabled] = useState(isCustodyAlertsEnabled)

  const rows: SettingsRow[] = [
    {
      key: 'appearance',
      label: 'Appearance',
      description: 'Light, dark, or match the system.',
      control: <Toggletheme />,
    },
    {
      key: 'custody-alerts',
      label: 'Custody deadline alerts',
      description: 'A native notification when an in-custody record approaches or passes its 48h/7d deadline.',
      control: (
        <Switch
          checked={alertsEnabled}
          onCheckedChange={(checked) => {
            setCustodyAlertsEnabled(checked)
            setAlertsEnabled(checked)
          }}
          disabled={!isTauri()}
        />
      ),
    },
  ]

  return <SettingsTable rows={rows} className="md:max-w-lg" />
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
        <form.AppField name="stationName">{(f) => <f.input label="Station name" placeholder="e.g. station-42" />}</form.AppField>

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

function NetworkTab() {
  const { data: status } = useRemoteAccessStatus()
  const { data: info } = useLocalNetworkInfo()
  const { data: tunnel } = useCloudflareTunnelState()
  const { data: log } = useRemoteAccessLog()
  const setEnabled = useSetRemoteAccessEnabled()
  const [showQr, setShowQr] = useState(false)
  const { data: qr } = useLocalPairingQr(showQr && status.enabled)

  const rows: SettingsRow[] = [
    {
      key: 'remote-access',
      label: 'Remote access',
      description: status.enabled
        ? status.hostname
          ? `Live at ${status.hostname}, and reachable on this station's local network.`
          : "On for this station's local network. Configure Cloudflare below for access from anywhere."
        : 'Off. Nothing outside this desktop app can reach station data.',
      control: (
        <Switch
          checked={status.enabled}
          onCheckedChange={(checked) => setEnabled.mutate(checked)}
          disabled={setEnabled.isPending}
        />
      ),
    },
  ]

  if (status.enabled) {
    rows.push({
      key: 'local-network',
      label: "This station's local network",
      description: info.address ? `Reachable at ${info.address}:${info.port} on this network.` : 'No local network address found.',
      control: info.address ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Hide pairing QR' : 'Show pairing QR'}
        </Button>
      ) : null,
      expanded: showQr && qr ? <div className="w-40 [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsTable rows={rows} className="md:max-w-lg" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Cloudflare Tunnel</h2>
          {tunnel && <Badge variant="secondary">Active at {tunnel.hostname}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground md:max-w-lg">
          Makes this station reachable from anywhere, not just its own network.
        </p>
        <CloudflareForm />
      </div>

      <div className="flex items-center justify-between md:max-w-lg">
        <p className="text-xs text-muted-foreground">{log.length} remote actions logged.</p>
        <Link to="/logs/remote-access" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
          View logs
        </Link>
      </div>
    </div>
  )
}

function DataTab() {
  return (
    <div className="flex flex-col gap-6">
      <ImportWizard />
      <BulkFileIntake />
      <ExportPanel />
    </div>
  )
}

function AboutTab() {
  const info = useAppInfo()
  return (
    <div className="flex flex-col gap-1">
      <p>Pleadli Police is an offline-first desktop app for station operations, custody compliance, and case work.</p>
      <p className="text-xs text-muted-foreground">
        All data is stored locally on this device by default. Station identity and establishment are configured
        under Station Admin. Officer logins exist only for remote access, configured under the Network tab.
      </p>
      {info && (
        <p className="text-xs text-muted-foreground">
          Version {info.version} on {info.platform} ({info.arch}) · {format(Date.now(), 'PPP')}
        </p>
      )}
    </div>
  )
}

function RouteComponent() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Settings</h1>
        <p>Preferences for this device. Nothing here is shared or synced.</p>
      </section>

      <Tabs
        value={tab ?? 'general'}
        onValueChange={(value) => navigate({ search: { tab: value === 'general' ? undefined : String(value) } })}
      >
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="network" className="pt-4">
          <NetworkTab />
        </TabsContent>
        <TabsContent value="data" className="pt-4">
          <DataTab />
        </TabsContent>
        <TabsContent value="about" className="pt-4">
          <AboutTab />
        </TabsContent>
      </Tabs>
    </article>
  )
}
