import { BackupPane, SecurityPane } from '@/features/security/settings-panes'
import { SettingsCard } from '@/components/settings-card'
import { Toggletheme } from '@/components/toggle-theme'
import { isIntakeAlertsEnabled, setIntakeAlertsEnabled } from '@/hooks/use-intake-alerts'
import { ApiError } from '@/lib/api'
import { useProsecutorProfile, useSaveProsecutorProfile } from '@/features/prosecutor-profile'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

const sections = [
  { id: 'prosecutor', label: 'Prosecutor', about: 'Who decisions and documents are attributed to. There is no sign-in: this installation belongs to one prosecutor.', owner: 'You decide' },
  { id: 'appearance', label: 'Appearance', about: 'How the workspace looks on this machine.', owner: 'This machine' },
  { id: 'notifications', label: 'Notifications', about: 'When the desktop tells you work has arrived.', owner: 'This machine' },
  { id: 'security', label: 'Security', about: 'Encryption of the records, the application lock and the audit trail.', owner: 'This machine' },
  { id: 'backup', label: 'Backup', about: 'Keeping an encrypted copy of the record somewhere else, and restoring it.', owner: 'This machine' },
] as const

export type SettingsSectionId = (typeof sections)[number]['id']

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return sections.some((section) => section.id === value)
}

function ProsecutorPane() {
  const { data: profile } = useProsecutorProfile()
  const save = useSaveProsecutorProfile()

  const form = useAppForm({
    defaultValues: { name: profile?.name ?? '', rank: profile?.rank ?? '', isDpp: profile?.isDpp ?? false },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ name: value.name, rank: value.rank.trim() ? value.rank : null, isDpp: value.isDpp })
        t.success('Prosecutor saved')
      } catch (error) {
        t.error('Could not save', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <SettingsCard
      title="Identity"
      description="Your name and rank appear on decisions and on documents such as the charge sheet's sanctioning line."
      hint="Saved on this machine."
      action={
        <form.AppForm>
          <form.submit label="Save" />
        </form.AppForm>
      }
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="name">{(f) => <f.input label="Full name" />}</form.AppField>
      <form.AppField name="rank">{(f) => <f.input label="Rank (optional)" placeholder="e.g. Senior State Attorney" />}</form.AppField>
      <form.AppField name="isDpp">
        {(f) => (
          <label className="flex items-start justify-between gap-4">
            <span className="flex flex-col gap-1">
              <strong>Director of Public Prosecutions</strong>
              <p>This installation is used by the DPP personally. Discontinuing proceedings and entering a nolle prosequi cannot be delegated, so they are refused unless this is on.</p>
            </span>
            <Switch checked={f.state.value} onCheckedChange={(checked) => f.handleChange(checked)} />
          </label>
        )}
      </form.AppField>
    </SettingsCard>
  )
}

function AppearancePane() {
  return (
    <SettingsCard title="Theme" description="Light, dark, or follow the system." hint="Also in the window's title bar.">
      <div className="w-40">
        <Toggletheme />
      </div>
    </SettingsCard>
  )
}

function NotificationsPane() {
  const [enabled, setEnabled] = useState(isIntakeAlertsEnabled)
  return (
    <SettingsCard title="Desktop alerts" description="A notification the first time a file appears waiting on a charging decision. It says a file arrived. It is not a deadline: there is none for that." hint="Only in the desktop app.">
      <label className="flex items-center justify-between gap-4">
        <strong>Alert me when a file arrives</strong>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setIntakeAlertsEnabled(checked)
            setEnabled(checked)
          }}
        />
      </label>
    </SettingsCard>
  )
}

const panes: Record<SettingsSectionId, () => ReactNode> = {
  prosecutor: () => <ProsecutorPane />,
  appearance: () => <AppearancePane />,
  notifications: () => <NotificationsPane />,
  security: () => <SecurityPane />,
  backup: () => <BackupPane />,
}

/** Settings as a left list of sections and one pane, the section in the URL so
 * it can be a tab, a link and a palette target. The pane is the one column
 * everything in a section sits in: `w-full` up to `md:max-w-md`, and nothing
 * inside it sets a width of its own. */
export function SettingsShell({ sectionId }: { sectionId: SettingsSectionId }) {
  const current = sections.find((section) => section.id === sectionId) ?? sections[0]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>This installation, this machine, and the prosecutor who uses it.</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label="Settings sections" className="flex shrink-0 flex-row flex-wrap gap-0.5 md:w-52 md:flex-col">
          {sections.map((section) => {
            const active = section.id === current.id
            return (
              <Link
                key={section.id}
                to="/settings/$section"
                params={{ section: section.id }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {section.label}
              </Link>
            )
          })}
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5 md:max-w-md">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-section">{current.label}</h2>
              <Badge variant="outline">{current.owner}</Badge>
            </div>
            <p>{current.about}</p>
          </div>
          {panes[current.id]()}
        </section>
      </div>
    </article>
  )
}
