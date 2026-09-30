import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { IntegrityCard } from '@/features/audit'
import { LogoCard } from '@/features/brand'
import { ProfileCard } from '@/features/profile'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const sections = [
  { id: 'bench', label: 'Bench', owner: 'You decide' },
  { id: 'security', label: 'Security', owner: 'This machine' },
  { id: 'roadmap', label: 'Roadmap', owner: 'This machine' },
] as const

export type SettingsSectionId = (typeof sections)[number]['id']

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return sections.some((section) => section.id === value)
}

const about: Record<SettingsSectionId, string> = {
  bench: "Who sits here. The audit trail records the judicial officer's name against what the bench does, and it heads what is signed.",
  security: 'The record of activity, kept apart from anything that could edit it without notice.',
  roadmap: "What this version does not cover yet, said plainly rather than left to look like a working feature that isn't.",
}

function RoadmapPane() {
  return (
    <SettingsCard
      title="Not built yet"
      description="This version covers the register, the cause list, sittings and their signed records, adjournments, exhibits, orders, rulings and judgments, audio recording with a typed transcript, returns, and an offline library you fill yourself. These are still to come."
    >
      <div role="list" className="flex flex-col gap-2">
        {[
          'A transcription engine (none is installed: passages are typed against the recording by a person)',
          'The Laws.Africa statute texts bundled and checked against source',
          'Backups and restoring from one',
          'App lock',
          'Receiving cases from DPP and sending notices back',
          'Prisons production and warrants',
        ].map((item) => (
          <div key={item} role="listitem" className="flex items-center justify-between gap-3">
            <p>{item}</p>
            <Tag tone="planned">Planned</Tag>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

const panes: Record<SettingsSectionId, () => ReactNode> = {
  bench: () => (
    <>
      <ProfileCard />
      <LogoCard />
    </>
  ),
  security: () => <IntegrityCard />,
  roadmap: () => <RoadmapPane />,
}

/** Settings as a left list of sections and one pane, the section in the URL
 * so it can be a tab and a real link, not a scroll position. The pane is the
 * one column everything in a section sits in: `w-full` up to `md:max-w-md`,
 * and nothing inside it sets a width of its own, so forms, lists and cards
 * always line up. Same shell shape as DPP and Prisons. */
export function SettingsShell({ sectionId }: { sectionId: SettingsSectionId }) {
  const current = sections.find((section) => section.id === sectionId) ?? sections[0]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Who sits here, and the state of the record.</p>
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
            <p>{about[current.id]}</p>
          </div>
          {panes[current.id]()}
        </section>
      </div>
    </article>
  )
}
