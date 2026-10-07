import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'
import { AiMagicIcon, Building03Icon, Route01Icon, SecurityLockIcon, UserCircleIcon, UserGroupIcon, Wifi01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

type NavIcon = typeof UserCircleIcon
import { AssistPane } from '@/features/assist/assist-settings'
import { NetworkPane } from '@/features/network'
import { PeoplePane, PracticePane, SecurityPane, YouPane } from './panes'

const sectionIds = ['you', 'practice', 'people', 'assist', 'security', 'network', 'roadmap'] as const
export type SettingsSectionId = (typeof sectionIds)[number]

const icons: Record<SettingsSectionId, NavIcon> = {
  you: UserCircleIcon,
  practice: Building03Icon,
  people: UserGroupIcon,
  assist: AiMagicIcon,
  security: SecurityLockIcon,
  network: Wifi01Icon,
  roadmap: Route01Icon,
}

const sections: readonly { id: SettingsSectionId; label: () => string; owner: () => string; about: () => string }[] = [
  { id: 'you', label: () => m["settings.section.you"](), owner: () => m["settings.owner.you"](), about: () => m["settings.about.you"]() },
  { id: 'practice', label: () => m["settings.section.practice"](), owner: () => m["settings.owner.practice"](), about: () => m["settings.about.practice"]() },
  { id: 'people', label: () => m["settings.section.people"](), owner: () => m["settings.owner.practice"](), about: () => m["settings.about.people"]() },
  { id: 'assist', label: () => m["assist.settings.title"](), owner: () => m["settings.owner.practice"](), about: () => m["settings.about.assist"]() },
  { id: 'security', label: () => m["settings.section.security"](), owner: () => m["settings.owner.computer"](), about: () => m["settings.about.security"]() },
  { id: 'network', label: () => m["settings.section.network"](), owner: () => m["settings.owner.computer"](), about: () => m["settings.about.network"]() },
  { id: 'roadmap', label: () => m["settings.section.roadmap"](), owner: () => m["settings.owner.computer"](), about: () => m["settings.about.roadmap"]() },
]

/** The list in groups by who owns each choice: you, the practice, this computer, and what is to come. */
const groups = [['you'], ['practice', 'people', 'assist'], ['security', 'network'], ['roadmap']].map((ids) => ids.map((id) => sections.find((s) => s.id === id)!))

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return sectionIds.includes(value as SettingsSectionId)
}

/** What the app does and what is still to come, stated as it is. */
const roadmap: readonly { label: () => string; built: boolean }[] = [
  { label: () => m["settings.roadmap.matter_types"](), built: true },
  { label: () => m["settings.roadmap.clocks"](), built: true },
  { label: () => m["settings.roadmap.filing"](), built: true },
  { label: () => m["settings.roadmap.money"](), built: true },
  { label: () => m["settings.roadmap.registers"](), built: true },
  { label: () => m["settings.roadmap.assist"](), built: true },
  { label: () => m["settings.roadmap.network"](), built: true },
  { label: () => m["settings.roadmap.court"](), built: false },
  { label: () => m["settings.roadmap.backups"](), built: false },
]

function RoadmapPane() {
  return (
    <SettingsCard title={m["settings.roadmap.title"]()} description={m["settings.roadmap.description"]()}>
      <div role="list" className="flex flex-col gap-2">
        {roadmap.map((item, i) => (
          <div key={i} role="listitem" className="flex items-center justify-between gap-3">
            <p>{item.label()}</p>
            {item.built ? <Tag tone="done">{m["settings.roadmap.built"]()}</Tag> : <Tag tone="planned">{m["settings.roadmap.planned"]()}</Tag>}
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

const panes: Record<SettingsSectionId, () => ReactNode> = {
  you: () => <YouPane />,
  practice: () => <PracticePane />,
  people: () => <PeoplePane />,
  assist: () => <AssistPane />,
  security: () => <SecurityPane />,
  network: () => <NetworkPane />,
  roadmap: () => <RoadmapPane />,
}

/** Settings as a left list of sections and one pane, the section in the URL
 * so it can be a tab and a real link, not a scroll position. The list is drawn
 * like a Mac's System Settings; the pane fills the rest of the page's one
 * width, and nothing inside it sets a width of its own. */
export function SettingsShell({ sectionId }: { sectionId: SettingsSectionId }) {
  const current = sections.find((section) => section.id === sectionId) ?? sections[0]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["settings.title"]()}</h1>
          <p>{m["settings.lead"]()}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={m["settings.sections"]()} className="flex shrink-0 flex-col gap-4 md:sticky md:top-0 md:w-56 md:self-start">
          {groups.map((group, i) => (
            <div key={i} role="group" aria-label={group[0].owner()} className="flex flex-col gap-px">
              {group.map((section) => {
                const active = section.id === current.id
                return (
                  <Link
                    key={section.id}
                    to="/settings/$section"
                    params={{ section: section.id }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem] no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                      active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-foreground/5',
                    )}
                  >
                    <HugeiconsIcon icon={icons[section.id]} className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                    {section.label()}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-section">{current.label()}</h2>
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">{current.owner()}</span>
            </div>
            <p>{current.about()}</p>
          </div>
          {panes[current.id]()}
        </section>
      </div>
    </article>
  )
}
