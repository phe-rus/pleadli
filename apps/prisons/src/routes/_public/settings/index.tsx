import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { DevRoleSwitch } from '@/components/dev-role-switch'
import { peerSyncConfigOptions } from '@/features/facilities'
import { NetworkTab } from '@/features/facilities/network-tabs'
import { NumberingSettings } from '@/features/numbering'
import { cloudflareConfigOptions } from '@/features/network'
import { BackupsPanel, NodePanel, backupsOptions } from '@/features/node'
import { usePermissions } from '@/features/session'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { createFileRoute } from '@tanstack/react-router'

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
        className="md:max-w-3xl"
        value={tab ?? 'general'}
        onValueChange={(value) => navigate({ search: { tab: value === 'general' ? undefined : String(value) } })}
      >
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="network">Network & Sync</TabsTrigger>
          {(can('prisoner.read') || can('node.manage') || can('hq.estate.read')) && <TabsTrigger value="numbering">Numbering and uniforms</TabsTrigger>}
          {can('node.manage') && <TabsTrigger value="node">Node and backups</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="network" className="pt-4">
          <NetworkTab />
        </TabsContent>
        {(can('prisoner.read') || can('node.manage') || can('hq.estate.read')) && (
          <TabsContent value="numbering" className="pt-4">
            <NumberingSettings />
          </TabsContent>
        )}
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
    <div className="flex flex-col gap-6">
      <SettingsTable rows={rows} />
      {import.meta.env.DEV && <DevRoleSwitch compact={false} />}
    </div>
  )
}
