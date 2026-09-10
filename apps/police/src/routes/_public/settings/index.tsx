import { Toggletheme } from '@/components/toggle-theme'
import { isCustodyAlertsEnabled, setCustodyAlertsEnabled } from '@/hooks/use-custody-deadline-alerts'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Separator } from '@pleadli/ui/separator'
import { Switch } from '@pleadli/ui/switch'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/settings/')({
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

function RouteComponent() {
  const [alertsEnabled, setAlertsEnabled] = useState(isCustodyAlertsEnabled)
  const info = useAppInfo()

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Settings</h1>
        <p>Preferences for this device. Nothing here is shared or synced.</p>
      </section>

      <FieldGroup className="md:max-w-lg">
        <Field orientation="horizontal">
          <div className="flex flex-col">
            <FieldLabel>Appearance</FieldLabel>
            <FieldDescription>Light, dark, or match the system.</FieldDescription>
          </div>
          <Toggletheme />
        </Field>

        <Field orientation="horizontal">
          <div className="flex flex-col">
            <FieldLabel>Custody deadline alerts</FieldLabel>
            <FieldDescription>
              A native notification when an in-custody record approaches or passes its 48h/7d compliance deadline.
            </FieldDescription>
          </div>
          <Switch
            checked={alertsEnabled}
            onCheckedChange={(checked) => {
              setCustodyAlertsEnabled(checked)
              setAlertsEnabled(checked)
            }}
            disabled={!isTauri()}
          />
        </Field>
      </FieldGroup>

      <Separator />

      <section className="flex flex-col gap-1">
        <h2>About</h2>
        <p>Pleadli Police is an offline-first desktop app for station operations, custody compliance, and case work.</p>
        <p className="text-xs text-muted-foreground">
          All data is stored locally on this device. Station identity and establishment are configured under
          Station Admin. Multi-officer accounts and sign-in are not yet available.
        </p>
        {info && (
          <p className="text-xs text-muted-foreground">
            Version {info.version} on {info.platform} ({info.arch})
          </p>
        )}
      </section>
    </article>
  )
}
