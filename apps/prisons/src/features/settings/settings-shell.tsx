import { JurisdictionPane } from '@/features/jurisdiction/jurisdiction-pane'
import { NetworkTab } from '@/features/facilities/network-tabs'
import { NumberingSettings } from '@/features/numbering'
import { BackupsPane as DailyBackupsPane, LicencePane as PleadliLicencePane } from '@/features/orchestra'
import { BackupsPanel, NodePanel } from '@/features/node'
import { useHqConfig, usePermissions } from '@/features/session'
import { m } from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { Building03Icon, CloudSavingDone01Icon, CloudUploadIcon, ComputerIcon, GridTableIcon, LanguageSkillIcon, LicenseIcon, Notification03Icon, PaintBoardIcon, SquareLock02Icon, NetworkIcon } from '@hugeicons/core-free-icons'
import { NotificationsPane } from './panes'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppearancePane, FacilityPane, LanguagePane, OrganisationPane, SecurityPane } from './panes'
import { ownerHint, ownerLabel, visibleSections, type SectionDef, type SectionId } from './sections'

const panes: Record<SectionId, () => ReactNode> = {
  jurisdiction: () => <JurisdictionPane />,
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
  'pleadli-licence': () => <PleadliLicencePane />,
  'daily-backups': () => <DailyBackupsPane />,
  notifications: () => <NotificationsPane />,
}

/** Each section's icon, one quiet colour, as DPP draws them. */
const sectionIcon: Record<SectionId, typeof Building03Icon> = {
  jurisdiction: GridTableIcon,
  facility: Building03Icon,
  organisation: Building03Icon,
  numbering: GridTableIcon,
  language: LanguageSkillIcon,
  appearance: PaintBoardIcon,
  'sign-in': SquareLock02Icon,
  'head-office': NetworkIcon,
  network: NetworkIcon,
  backup: CloudUploadIcon,
  device: ComputerIcon,
  'pleadli-licence': LicenseIcon,
  'daily-backups': CloudSavingDone01Icon,
  notifications: Notification03Icon,
}

const groupOrder = ['institution', 'computer', 'pleadli'] as const

/** Settings as a left list of sections and one pane, the section in the URL
 * so it can be a tab, a link and a palette target. Drawn the way DPP draws
 * it, like a Mac's System Settings: groups of plain-icon rows, the chosen one
 * filled with the accent, and beside the section's title a quiet pill for who
 * decides it. An unknown or unavailable section falls back to the first. */
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
        <nav aria-label={m.settings_sections()} className="flex shrink-0 flex-col gap-4 md:w-56">
          {groupOrder.map((group) => {
            const items = list.filter((section) => section.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} role="group" className="flex flex-col gap-px">
                {items.map((section) => {
                  const active = section.id === current?.id
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
                      <HugeiconsIcon icon={sectionIcon[section.id]} className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                      {section.label()}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {current && (
          <section aria-labelledby="settings-section" className="flex w-full min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="settings-section">{current.label()}</h2>
                <span title={ownerHint[current.owner]()} className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
                  {ownerLabel[current.owner]()}
                </span>
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
