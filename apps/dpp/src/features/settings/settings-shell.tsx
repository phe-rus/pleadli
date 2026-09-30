import { AssistPane } from '@/features/assist/assist-settings'
import { SignatureCard, StampCard } from '@/features/documents/seals'
import { BackupPane } from '@/features/security/settings-panes'
import { useSecurityStatus } from '@/features/security'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppearancePane, LicencePane, NotificationsPane, OfficePane, PeoplePane, ProtectionPane, YouPane } from './panes'

/** Settings, grouped by who owns each choice, so it is always clear whether a
 * change is yours, the whole office's (the administrator's) or only this
 * computer's. `id` stays a plain literal: it is compared and put in the URL;
 * every label comes from the catalog at render time. */
const groups = [
  { id: 'you', sections: ['you'] },
  { id: 'office', sections: ['office', 'people', 'protection', 'assist'] },
  { id: 'computer', sections: ['appearance', 'notifications', 'backup'] },
  { id: 'about', sections: ['licence'] },
] as const

type GroupId = (typeof groups)[number]['id']
export type SettingsSectionId = (typeof groups)[number]['sections'][number]

const allSections: readonly SettingsSectionId[] = groups.flatMap((g) => g.sections)

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return allSections.includes(value as SettingsSectionId)
}

const groupText: Record<GroupId, () => string> = {
  you: m["settings.group.you"],
  office: m["settings.group.office"],
  computer: m["settings.group.computer"],
  about: m["settings.group.about"],
}

const sectionText: Record<SettingsSectionId, { label: () => string; about: () => string }> = {
  you: { label: m["settings.nav.you"], about: m["settings.about.you"] },
  office: { label: m["settings.nav.office"], about: m["settings.about.office"] },
  people: { label: m["settings.nav.people"], about: m["settings.about.people"] },
  protection: { label: m["settings.nav.protection"], about: m["settings.about.protection"] },
  assist: { label: m["settings.nav.assist"], about: m["settings.about.assist"] },
  appearance: { label: m["settings.nav.appearance"], about: m["settings.about.appearance"] },
  notifications: { label: m["settings.nav.notifications"], about: m["settings.about.notifications"] },
  backup: { label: m["settings.nav.backup"], about: m["settings.about.backup"] },
  licence: { label: m["settings.nav.licence"], about: m["settings.about.licence"] },
}

const ownerOf = (group: GroupId) =>
  group === 'you' ? m["settings.owner.you"]() : group === 'office' ? m["settings.owner.office"]() : group === 'computer' ? m["settings.owner.this_machine"]() : m["settings.owner.read_only"]()

const panes: Record<SettingsSectionId, () => ReactNode> = {
  you: () => (
    <>
      <YouPane />
      <SignatureCard />
    </>
  ),
  office: () => (
    <>
      <OfficePane />
      <StampCard />
    </>
  ),
  people: () => <PeoplePane />,
  protection: () => <ProtectionPane />,
  assist: () => <AssistPane />,
  appearance: () => <AppearancePane />,
  notifications: () => <NotificationsPane />,
  backup: () => <BackupPane />,
  licence: () => <LicencePane />,
}

/** Settings as a left list of sections and one pane, the section in the URL so
 * it can be a tab, a link and a palette target. The pane is the one column
 * everything in a section sits in: `w-full` up to `md:max-w-md`, and nothing
 * inside it sets a width of its own. */
export function SettingsShell({ sectionId }: { sectionId: SettingsSectionId }) {
  const { data: status } = useSecurityStatus()
  const current = isSettingsSection(sectionId) ? sectionId : 'you'
  const group = groups.find((g) => (g.sections as readonly string[]).includes(current))!
  // With no sign-in there is nobody else to manage.
  const hidden = (id: SettingsSectionId) => id === 'people' && status?.level === 'none' && status?.actor?.role !== 'administrator'

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["settings.title"]()}</h1>
          <p>{m["settings.subtitle"]()}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={m["settings.title"]()} className="flex shrink-0 flex-col gap-4 md:w-52">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-0.5">
              <span className="px-2.5 pb-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">{groupText[g.id]()}</span>
              {g.sections
                .filter((id) => !hidden(id))
                .map((id) => {
                  const active = id === current
                  return (
                    <Link
                      key={id}
                      to="/settings/$section"
                      params={{ section: id }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                      )}
                    >
                      {sectionText[id].label()}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5 md:max-w-md">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-section">{sectionText[current].label()}</h2>
              <Badge variant="outline">{ownerOf(group.id)}</Badge>
            </div>
            <p>{sectionText[current].about()}</p>
          </div>
          {panes[current]()}
        </section>
      </div>
    </article>
  )
}
