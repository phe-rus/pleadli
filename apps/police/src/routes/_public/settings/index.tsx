import { Group, GroupRow } from '@pleadli/ui/grouped'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { useTheme } from '@/components/theme-provider'
import { useStationProfile } from '@/features/station-admin'
import { autoUpdate, checkNow, download as downloadUpdate, restart as restartApp, setAutoUpdate, useUpdateState } from '@/lib/updater'
import { Building06Icon, Database01Icon, Download04Icon, InformationCircleIcon, Notification03Icon, PaintBoardIcon, Share08Icon, SmartPhone01Icon, SquareLock02Icon, UserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Segmented } from '@pleadli/ui/segmented'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'
import * as m from '@/paraglide/messages'
import { SettingsTable, type SettingsRow as TableRow } from '@/components/settings-table'
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
import { Switch } from '@pleadli/ui/switch'
import { ConnectionSettings } from '@/features/command-link'
import { ListenerCard } from '@/features/command'
import { DevModeSwitch, SignInSettings, useInstallation } from '@/features/session'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useEffect, useState } from 'react'

type Section = 'station' | 'sign-in' | 'command' | 'remote' | 'records' | 'appearance' | 'notifications' | 'updates' | 'about'
const SECTIONS: Section[] = ['station', 'sign-in', 'command', 'remote', 'records', 'appearance', 'notifications', 'updates', 'about']

export const Route = createFileRoute('/_public/settings/')({
  validateSearch: (search: Record<string, unknown>): { section?: Section } => (SECTIONS.includes(search.section as Section) ? { section: search.section as Section } : {}),
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

  const rows: TableRow[] = [
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
      <SettingsTable rows={rows} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{m["settings.tunnel"]()}</h2>
          {tunnel && <Badge variant="secondary">{m["settings.tunnel_active"]({ host: tunnel.hostname })}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {m["settings.tunnel_desc"]()}
        </p>
        <CloudflareForm />
      </div>

      <div className="flex items-center justify-between">
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

function AppInfo() {
  const info = useAppInfo()
  return (
    <SettingsCard hint={m["settings.about_body"]()}>
      <SettingsRow label={m["workspace.product"]()} hint={m["settings.about_lead"]()}>
        <span className="text-muted-foreground tabular-nums">{info ? `${info.version} · ${info.platform} ${info.arch}` : '·'}</span>
      </SettingsRow>
    </SettingsCard>
  )
}

function StationPane() {
  const { data: profile } = useStationProfile()
  return (
    <>
      <SettingsCard title={m["settings.station.identity"]()} description={m["settings.station.identity_about"]()}>
        <SettingsRow label={m["settings.station.name"]()}>
          <span className="text-muted-foreground">{profile?.name || m["people_page.not_recorded"]()}</span>
        </SettingsRow>
        <SettingsRow label={m["identity.address"]()}>
          <span className="text-muted-foreground">{profile?.address || m["people_page.not_recorded"]()}</span>
        </SettingsRow>
        <div className="flex justify-end py-2.5!">
          <Link to="/station/profile" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            {m["settings.station.edit"]()}
          </Link>
        </div>
      </SettingsCard>
      <LogoCard labels={logoCardLabels()} />
    </>
  )
}

function AppearancePane() {
  const { theme = 'system', setTheme } = useTheme()
  const locale = useLocale()
  return (
    <SettingsCard>
      <SettingsRow label={m["settings.appearance"]()} hint={m["settings.appearance_desc"]()}>
        <Segmented
          label={m["settings.appearance"]()}
          value={(['light', 'dark', 'system'].includes(theme) ? theme : 'system') as 'light' | 'dark' | 'system'}
          onChange={setTheme}
          items={[
            { value: 'light', label: m["settings.theme_light"]() },
            { value: 'dark', label: m["settings.theme_dark"]() },
            { value: 'system', label: m["settings.theme_auto"]() },
          ]}
        />
      </SettingsRow>
      <SettingsRow label={m["settings.language"]()} hint={m["settings.language_desc"]()}>
        <Segmented label={m["settings.language"]()} value={locale} onChange={(l) => changeLocale(l)} items={selectableLocales.map((l) => ({ value: l, label: localeNames[l] }))} />
      </SettingsRow>
    </SettingsCard>
  )
}

function NotificationsPane() {
  const [alertsEnabled, setAlertsEnabled] = useState(isCustodyAlertsEnabled)
  return (
    <SettingsCard hint={isTauri() ? undefined : m["settings.desktop_only"]()}>
      <SettingsRow label={m["settings.custody_alerts"]()} hint={m["settings.custody_alerts_desc"]()}>
        <Switch
          checked={alertsEnabled}
          onCheckedChange={(checked) => {
            setCustodyAlertsEnabled(checked)
            setAlertsEnabled(checked)
          }}
          disabled={!isTauri()}
        />
      </SettingsRow>
      {import.meta.env.DEV && (
        <SettingsRow label={m["settings.dev_mode"]()} hint={m["settings.dev_mode_desc"]()}>
          <DevModeSwitch />
        </SettingsRow>
      )}
    </SettingsCard>
  )
}

function UpdatesPane() {
  const u = useUpdateState()
  const auto = autoUpdate()
  if (u.phase === 'unsupported') {
    return (
      <SettingsCard>
        <SettingsRow label={m["update.title"]()} hint={m["update.browser"]()}>
          <span />
        </SettingsRow>
      </SettingsCard>
    )
  }
  const status =
    u.phase === 'checking'
      ? m["update.checking"]()
      : u.phase === 'current'
        ? m["update.current"]()
        : u.phase === 'available'
          ? m["update.available"]({ version: u.version ?? '' })
          : u.phase === 'downloading'
            ? m["update.downloading"]({ percent: String(Math.round(u.progress * 100)) })
            : u.phase === 'ready'
              ? m["update.ready"]({ version: u.version ?? '' })
              : u.phase === 'failed'
                ? m["update.failed"]()
                : m["update.not_checked"]()
  return (
    <>
      <SettingsCard hint={u.phase === 'failed' && u.error ? u.error : u.checkedAt ? m["update.checked_at"]({ time: format(u.checkedAt, 'HH:mm') }) : undefined}>
        <SettingsRow label={m["update.version"]()}>
          <span className="text-muted-foreground tabular-nums">{u.current ?? '·'}</span>
        </SettingsRow>
        <SettingsRow label={status}>
          {u.phase === 'available' ? (
            <Button size="sm" onClick={() => void downloadUpdate()}>
              {m["update.get"]()}
            </Button>
          ) : u.phase === 'ready' ? (
            <Button size="sm" onClick={() => void restartApp()}>
              {m["update.restart"]()}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={u.phase === 'checking' || u.phase === 'downloading'} onClick={() => void checkNow(true)}>
              {m["update.check"]()}
            </Button>
          )}
        </SettingsRow>
      </SettingsCard>
      <SettingsCard hint={m["update.auto_hint"]()}>
        <SettingsRow label={m["update.auto"]()}>
          <Switch checked={auto} onCheckedChange={setAutoUpdate} aria-label={m["update.auto"]()} />
        </SettingsRow>
      </SettingsCard>
    </>
  )
}

function RecordsPane() {
  return (
    <>
      <Group title={m["settings.records.logs"]()}>
        <GroupRow label={m["nav.backup_requests"]()} chevron render={({ className, children }) => <Link to="/logs/backup-alerts" className={className}>{children}</Link>} />
        <GroupRow label={m["nav.remote_access"]()} chevron render={({ className, children }) => <Link to="/logs/remote-access" className={className}>{children}</Link>} />
      </Group>
      <DataTab />
    </>
  )
}

/** Settings as System Settings lays them out: a quiet list of sections on the
 * left, grouped by whose choice it is (the station's, or this computer's), and
 * one pane on the right. The section is in the address, so it can be linked. */
function RouteComponent() {
  const { section } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: installation } = useInstallation()
  const command = installation?.mode === 'command'

  const groups: { id: string; label: string; sections: Section[] }[] = [
    { id: 'station', label: command ? m["settings.group.command"]() : m["settings.group.station"](), sections: command ? ['station', 'sign-in', 'command'] : ['station', 'sign-in', 'command', 'remote', 'records'] },
    { id: 'computer', label: m["settings.group.computer"](), sections: ['appearance', 'notifications', 'updates'] },
    { id: 'about', label: m["settings.group.about"](), sections: ['about'] },
  ]
  const visible = groups.flatMap((g) => g.sections)
  const current: Section = section && visible.includes(section) ? section : 'station'

  const text: Record<Section, { label: string; about: string; icon: typeof UserIcon }> = {
    station: { label: command ? m["nav.command_profile"]() : m["settings.nav.station"](), about: m["settings.about.station"](), icon: Building06Icon },
    'sign-in': { label: m["settings.tab_sign_in"](), about: m["settings.about.sign_in"](), icon: SquareLock02Icon },
    command: { label: command ? m["settings.tab_stations"]() : m["settings.tab_command"](), about: command ? m["settings.about.stations"]() : m["settings.about.command"](), icon: Share08Icon },
    remote: { label: m["settings.nav.remote"](), about: m["settings.about.remote"](), icon: SmartPhone01Icon },
    records: { label: m["settings.nav.records"](), about: m["settings.about.records"](), icon: Database01Icon },
    appearance: { label: m["settings.appearance"](), about: m["settings.about.appearance"](), icon: PaintBoardIcon },
    notifications: { label: m["settings.nav.notifications"](), about: m["settings.about.notifications"](), icon: Notification03Icon },
    updates: { label: m["update.title"](), about: m["update.about"](), icon: Download04Icon },
    about: { label: m["settings.tab_about"](), about: m["settings.about.about"](), icon: InformationCircleIcon },
  }

  const panes: Record<Section, () => ReactNode> = {
    station: () => <StationPane />,
    'sign-in': () => <SignInSettings />,
    command: () => (command ? <ListenerCard /> : <ConnectionSettings />),
    remote: () => <NetworkTab />,
    records: () => <RecordsPane />,
    appearance: () => <AppearancePane />,
    notifications: () => <NotificationsPane />,
    updates: () => <UpdatesPane />,
    about: () => <AppInfo />,
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.settings"]()}</h1>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={m["nav.settings"]()} className="flex shrink-0 flex-col gap-4 md:w-56">
          {groups.map((g) => (
            <div key={g.id} role="group" aria-label={g.label} className="flex flex-col gap-px">
              {g.sections.map((id) => {
                const active = id === current
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => void navigate({ search: id === 'station' ? {} : { section: id }, replace: true })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                      active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-foreground/5',
                    )}
                  >
                    <HugeiconsIcon icon={text[id].icon} className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                    {text[id].label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="settings-section">{text[current].label}</h2>
            <p className="text-muted-foreground">{text[current].about}</p>
          </div>
          {panes[current]()}
        </section>
      </div>
    </article>
  )
}
