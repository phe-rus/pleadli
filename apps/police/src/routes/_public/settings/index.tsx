import * as m from '@/paraglide/messages'
import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { LogoCard, type LogoCardLabels } from '@/features/brand'
import { changeLocale, localeNames, selectableLocales, useLocale } from '@/features/i18n'
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { ConnectionSettings } from '@/features/command-link'
import { ListenerCard } from '@/features/command'
import { DevModeSwitch, SignInSettings, useInstallation } from '@/features/session'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
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

/** The logo card's words, in the current language. */
function logoCardLabels(): LogoCardLabels {
  return {
    title: m["brand.title"](),
    description: m["brand.description"](),
    hint: m["brand.hint"](),
    upload: m["brand.upload"](),
    reset: m["brand.reset"](),
    saved: m["brand.saved"](),
    failed: m["brand.failed"](),
    isDefault: m["brand.is_default"](),
    isCustom: m["brand.is_custom"](),
  }
}

/** Language names are shown in their own language, so each one reads the same
 * whatever language is chosen now. */
function LanguageSelectField() {
  const locale = useLocale()
  const languageOptions = selectableLocales.map((value) => ({ value, label: localeNames[value] }))
  return (
    <Select items={languageOptions} value={locale} onValueChange={(value) => value && changeLocale(String(value))}>
      <SelectTrigger size="sm" className="max-w-xs">
        <SelectValue placeholder={localeNames[locale]} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {languageOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function GeneralTab() {
  const [alertsEnabled, setAlertsEnabled] = useState(isCustodyAlertsEnabled)

  const rows: SettingsRow[] = [
    {
      key: 'language',
      label: m["settings.language"](),
      description: m["settings.language_desc"](),
      control: <LanguageSelectField />,
    },
    {
      key: 'appearance',
      label: m["settings.appearance"](),
      description: m["settings.appearance_desc"](),
      control: <Toggletheme />,
    },
    {
      key: 'custody-alerts',
      label: m["settings.custody_alerts"](),
      description: m["settings.custody_alerts_desc"](),
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
    ...(import.meta.env.DEV
      ? [
          {
            key: 'dev-mode',
            label: m["settings.dev_mode"](),
            description: m["settings.dev_mode_desc"](),
            control: <DevModeSwitch />,
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6 md:max-w-lg">
      <LogoCard labels={logoCardLabels()} />
      <SettingsTable rows={rows} />
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
        t.success(m["settings.cf_saved"]())
      } catch {
        t.error(m["settings.cf_save_failed"](), { description: m["common.try_again"]() })
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
              label={m["settings.api_token"]()}
              placeholder={config ? m["settings.keep_token"]() : undefined}
            />
          )}
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="accountId">{(f) => <f.input label={m["settings.account_id"]()} />}</form.AppField>
          <form.AppField name="domain">{(f) => <f.input label={m["settings.domain"]()} placeholder={m["settings.domain_placeholder"]()} />}</form.AppField>
        </div>
        <form.AppField name="stationName">{(f) => <f.input label={m["command.station_name"]()} placeholder={m["settings.cf_station_placeholder"]()} />}</form.AppField>

        <form.Subscribe selector={(state) => [state.values.stationName, state.values.domain] as const}>
          {([stationName, domain]) => (
            <FieldDescription>{m["settings.becomes"]({ host: `${stationName || 'station-name'}.${domain || 'pleadli.com'}` })}</FieldDescription>
          )}
        </form.Subscribe>
      </FieldGroup>

      <form.AppForm>
        <form.submit label={m["settings.cf_submit"]()} />
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
      label: m["nav.remote_access"](),
      description: status.enabled
        ? status.hostname
          ? m["settings.remote_live"]({ host: status.hostname })
          : m["settings.remote_local"]()
        : m["settings.remote_off"](),
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
      label: m["settings.local_network"](),
      description: info.address
        ? m["settings.reachable_at"]({ address: `${info.address}:${info.port}` })
        : m["settings.no_address"](),
      control: info.address ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowQr((v) => !v)}>
          {showQr ? m["settings.hide_qr"]() : m["settings.show_qr"]()}
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
          <h2 className="text-sm font-medium text-muted-foreground">{m["settings.tunnel"]()}</h2>
          {tunnel && <Badge variant="secondary">{m["settings.tunnel_active"]({ host: tunnel.hostname })}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground md:max-w-lg">
          {m["settings.tunnel_desc"]()}
        </p>
        <CloudflareForm />
      </div>

      <div className="flex items-center justify-between md:max-w-lg">
        <p className="text-xs text-muted-foreground">{m["settings.remote_logged"]({ count: log.length })}</p>
        <Link to="/logs/remote-access" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
          {m["settings.view_logs"]()}
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
      <p>{m["settings.about_lead"]()}</p>
      <p className="text-xs text-muted-foreground">
        {m["settings.about_body"]()}
      </p>
      {info && (
        <p className="text-xs text-muted-foreground">
          {m["settings.version"]({ version: info.version, platform: info.platform, arch: info.arch, date: format(Date.now(), 'PPP') })}
        </p>
      )}
    </div>
  )
}

function RouteComponent() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: installation } = useInstallation()
  const command = installation?.mode === 'command'

  return (
    <article className="page">
      <section className="flex flex-col">
        <h1>{m["nav.settings"]()}</h1>
        <p>{m["settings.lead"]()}</p>
      </section>

      <Tabs
        value={tab ?? 'general'}
        onValueChange={(value) => navigate({ search: { tab: value === 'general' ? undefined : String(value) } })}
      >
        <TabsList variant="line">
          <TabsTrigger value="general">{m["settings.tab_general"]()}</TabsTrigger>
          <TabsTrigger value="sign-in">{m["settings.tab_sign_in"]()}</TabsTrigger>
          {command ? <TabsTrigger value="command">{m["settings.tab_stations"]()}</TabsTrigger> : <TabsTrigger value="connection">{m["settings.tab_command"]()}</TabsTrigger>}
          {!command && <TabsTrigger value="network">{m["settings.tab_network"]()}</TabsTrigger>}
          {!command && <TabsTrigger value="data">{m["settings.tab_data"]()}</TabsTrigger>}
          <TabsTrigger value="about">{m["settings.tab_about"]()}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="sign-in" className="pt-4 md:max-w-xl">
          <SignInSettings />
        </TabsContent>
        <TabsContent value="connection" className="pt-4 md:max-w-xl">
          <ConnectionSettings />
        </TabsContent>
        <TabsContent value="command" className="pt-4 md:max-w-xl">
          <ListenerCard />
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
