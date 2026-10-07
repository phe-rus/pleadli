import { AssistPane } from '@/features/assist/assist-settings'
import { SignatureCard, StampCard } from '@/features/documents/seals'
import { BackupPane } from '@/features/security/settings-panes'
import { useSecurityStatus } from '@/features/security'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { Building03Icon, CloudUploadIcon, LegalDocument01Icon, Notification03Icon, PaintBoardIcon, SparklesIcon, SquareLock02Icon, UserGroupIcon, UserIcon } from '@hugeicons/core-free-icons'
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

/** Each section's icon, one quiet colour (the user turned down tinted squares). */
const sectionIcon: Record<SettingsSectionId, { icon: typeof UserIcon; tone?: string }> = {
  you: { icon: UserIcon, tone: 'blue' },
  office: { icon: Building03Icon, tone: 'teal' },
  people: { icon: UserGroupIcon, tone: 'blue' },
  protection: { icon: SquareLock02Icon, tone: 'gray' },
  assist: { icon: SparklesIcon, tone: 'purple' },
  appearance: { icon: PaintBoardIcon, tone: 'orange' },
  notifications: { icon: Notification03Icon, tone: 'red' },
  backup: { icon: CloudUploadIcon, tone: 'green' },
  licence: { icon: LegalDocument01Icon, tone: 'gray' },
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
 * it can be a tab, a link and a palette target. The list is drawn like a Mac's
 * System Settings: a quiet icon per section, the chosen one filled with the accent. The
 * pane fills the rest of the page's one width; nothing inside it sets its own. */
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
        <nav aria-label={m["settings.title"]()} className="flex shrink-0 flex-col gap-4 md:w-56">
          {groups.map((g) => (
            <div key={g.id} role="group" aria-label={groupText[g.id]()} className="flex flex-col gap-px">
              {g.sections
                .filter((id) => !hidden(id))
                .map((id) => {
                  const active = id === current
                  const { icon } = sectionIcon[id]
                  return (
                    <Link
                      key={id}
                      to="/settings/$section"
                      params={{ section: id }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem] no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-foreground/5',
                      )}
                    >
                      <HugeiconsIcon icon={icon} className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                      {sectionText[id].label()}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-section">{sectionText[current].label()}</h2>
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">{ownerOf(group.id)}</span>
            </div>
            <p>{sectionText[current].about()}</p>
          </div>
          {panes[current]()}
        </section>
      </div>
    </article>
  )
}
