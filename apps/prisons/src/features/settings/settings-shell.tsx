import { NetworkTab } from '@/features/facilities/network-tabs'
import { NumberingSettings } from '@/features/numbering'
import { BackupsPanel, NodePanel } from '@/features/node'
import { useHqConfig, usePermissions } from '@/features/session'
import { m } from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppearancePane, FacilityPane, LanguagePane, OrganisationPane, SecurityPane } from './panes'
import { ownerHint, ownerLabel, visibleSections, type SectionDef, type SectionId } from './sections'

const panes: Record<SectionId, () => ReactNode> = {
  facility: () => <FacilityPane />,
  organisation: () => <OrganisationPane />,
  numbering: () => <NumberingSettings />,
  language: () => <LanguagePane />,
  appearance: () => <AppearancePane />,
  'sign-in': () => <SecurityPane />,
  'head-office': () => <NetworkTab />,
  network: () => <NetworkTab />,
  backup: () => <BackupsPanel />,
  device: () => <NodePanel />,
}

/** Settings as a left list of sections and one pane, the section in the URL
 * so it can be a tab, a link and a palette target. Every pane carries the
 * chip that says who decides it. An unknown or unavailable section falls back
 * to the first one this officer can see.
 *
 * The pane is the one column everything in a section sits in: `w-full` up to
 * `md:max-w-md`, and nothing inside it sets a width of its own, so forms,
 * lists and cards always line up. */
export function SettingsShell({ sectionId }: { sectionId?: string }) {
  const { data: hqConfig } = useHqConfig()
  const { session } = usePermissions()
  const list = visibleSections(hqConfig?.isHeadOffice ?? false, session?.permissions)
  const current: SectionDef | undefined = list.find((section) => section.id === sectionId) ?? list[0]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.settings_title()}</h1>
          <p>{m.settings_intro()}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={m.settings_sections()} className="flex shrink-0 flex-row flex-wrap gap-0.5 md:w-52 md:flex-col">
          {list.map((section) => {
            const active = section.id === current?.id
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
                {section.label()}
              </Link>
            )
          })}
        </nav>

        {current && (
          <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5 md:max-w-md">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="settings-section">{current.label()}</h2>
                <Badge variant="outline" title={ownerHint[current.owner]()}>
                  {ownerLabel[current.owner]()}
                </Badge>
              </div>
              <p>{current.about()}</p>
            </div>
            {panes[current.id]()}
          </section>
        )}
      </div>
    </article>
  )
}
