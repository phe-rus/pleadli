import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
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
 * so it can be a tab and a real link, not a scroll position. The pane is the
 * one column everything in a section sits in: `w-full` up to `md:max-w-md`,
 * and nothing inside it sets a width of its own, so forms, lists and cards
 * always line up. */
export function SettingsShell({ sectionId }: { sectionId: SettingsSectionId }) {
  const current = sections.find((section) => section.id === sectionId) ?? sections[0]

  return (
    <article className="page">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
        <nav aria-label={m["settings.sections"]()} className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
          <h1 className="px-3">{m["settings.title"]()}</h1>
          <div className="flex flex-row flex-wrap gap-0.5 md:flex-col">
            {sections.map((section) => {
              const active = section.id === current.id
              return (
                <Link
                  key={section.id}
                  to="/settings/$section"
                  params={{ section: section.id }}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-full px-3 py-2 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  <HugeiconsIcon icon={icons[section.id]} size={18} />
                  {section.label()}
                </Link>
              )
            })}
          </div>
        </nav>

        <section aria-labelledby="settings-section" className="flex w-full min-w-0 max-w-2xl flex-col gap-6">
          <div className="flex flex-col gap-1 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="settings-section">{current.label()}</h2>
              <Badge variant="outline">{current.owner()}</Badge>
            </div>
            <p className="text-muted-foreground">{current.about()}</p>
          </div>
          {panes[current.id]()}
        </section>
      </div>
    </article>
  )
}
