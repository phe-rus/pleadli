import * as m from '@/paraglide/messages'
import { isNavActive, navFor, sectionsFor, type NavItem } from '@/data/navigationItems'
import { signOut, useInstallation, useMe } from '@/features/session'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { ArrowDown01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { useStationCounts } from './station-counts'
import { useGo, useTabActions } from './tab-actions'
import { tabIcon } from './tab-icon'
import { tabLabel } from './tab-identity'
import { MAX_RECENTS, useWorkspace, type SectionId } from './tabs-store'

const rowClass = 'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** One folding group of the sidebar. The fold state is remembered; the height
 * eases with CSS only, and not at all when reduced motion is preferred. */
function Section({ id, label, children }: { id: SectionId; label: string; children: ReactNode }) {
  const { sections, toggleSection } = useWorkspace()
  const open = sections[id]
  return (
    <section className="flex flex-col">
      {/* The title takes the global heading style, so nothing here sets type.
          The button only inherits it, and the fold arrow sits at the far end. */}
      <h6>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`section-${id}`}
          onClick={() => toggleSection(id)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left [text-transform:inherit] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {label}
          <HugeiconsIcon icon={ArrowDown01Icon} className={cn('size-4.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none', !open && '-rotate-90')} />
        </button>
      </h6>
      <div id={`section-${id}`} className={cn('grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="flex flex-col pt-0.5 pb-1">{children}</div>
        </div>
      </div>
    </section>
  )
}

/** A small coloured chip, only for a count that means work to do. */
function CountChip({ value, tone }: { value: number; tone: 'open' | 'due' }) {
  if (!value) return null
  return (
    <span
      className={cn(
        'mr-1.5 rounded-full px-1.5 text-[0.625rem] leading-4 font-semibold tabular-nums',
        tone === 'due' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function Row({ icon, label, active, onOpen, chip }: { icon: NavItem['icon']; label: string; active: boolean; onOpen: () => void; chip?: ReactNode }) {
  return (
    <div className={cn('flex items-center rounded-md transition-colors duration-100 hover:bg-secondary/70 motion-reduce:transition-none', active && 'bg-secondary text-primary')}>
      <button type="button" onClick={onOpen} aria-current={active ? 'page' : undefined} className={cn(rowClass, active && 'font-medium')}>
        <HugeiconsIcon icon={icon} className="size-4.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
      {chip}
    </div>
  )
}

/** Who is signed in, and where: the officer's rank and name, the station or
 * command they are in, and the way out. */
function SidebarOfficer() {
  const { data: profile } = useQuery(stationProfileOptions())
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  if (!me) return null
  return (
    <div className="flex min-w-0 items-center gap-2 px-1 py-0.5">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{[me.rank, me.name].filter(Boolean).join(' ')}</span>
        <span className="truncate text-xs text-muted-foreground">
          {profile?.name ?? m["workspace.not_named"]()}
          {me.role === 'admin' ? m["workspace.administrator_suffix"]() : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={() =>
          void signOut().finally(() => {
            queryClient.clear()
            window.location.reload()
          })
        }
        className="cursor-pointer text-xs text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {m["workspace.sign_out"]()}
      </button>
    </div>
  )
}

/** The left sidebar: where you have been and what is open, then the areas in
 * three groups. Small and contextual on purpose. The main ways in are search,
 * quick actions and tabs. Counts are read from the record, and a chip shows
 * only when there is work behind it. */
export function Navigator() {
  const { tabs, recents, activeKey, leftOpen, setCommandOpen } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const go = useGo()
  const { activate } = useTabActions()
  const counts = useStationCounts()
  const { data: installation } = useInstallation()
  const nav = navFor(installation?.mode)
  const sections = sectionsFor(installation?.mode)

  const pinned = tabs.filter((tab) => tab.pinned && tab.kind !== 'overview')
  const recent = recents.filter((item) => item.kind !== 'overview').slice(0, MAX_RECENTS)

  /** Custody shows what is due first, and only when nothing is due, who is in
   * the cells. Every other chip is a count of work waiting. */
  const chipOf = (item: NavItem): { value: number; tone: 'open' | 'due' } => {
    if (!counts || !item.count) return { value: 0, tone: 'open' }
    if (item.count === 'inCells') return counts.custodyDue > 0 ? { value: counts.custodyDue, tone: 'due' } : { value: counts.inCells, tone: 'open' }
    if (item.count === 'stationsAttention') return { value: counts.stationsAttention, tone: 'due' }
    return { value: counts[item.count], tone: 'open' }
  }

  return (
    <aside
      aria-label={m["workspace.sidebar"]()}
      inert={!leftOpen}
      className={cn('shrink-0 overflow-hidden bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none print:hidden', leftOpen ? 'w-78' : 'w-0')}
    >
      <div className="flex h-full w-78 flex-col">
        {installation?.mode === 'station' && (
          <div className="px-2 pt-2 pb-1">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-background px-2 text-xs text-muted-foreground transition-colors outline-none hover:border-border/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
              <span className="truncate">{m["workspace.search_hint"]()}</span>
            </button>
          </div>
        )}

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pt-1 pb-2">
          {pinned.length > 0 && (
            <Section id="pinned" label={m["workspace.pinned"]()}>
              {pinned.map((tab) => (
                <Row key={tab.key} icon={tabIcon(tab)} label={tabLabel(tab)} active={tab.key === activeKey} onOpen={() => activate(tab)} />
              ))}
            </Section>
          )}
          {recent.length > 0 && (
            <Section id="recent" label={m["workspace.recent"]()}>
              {recent.map((item) => (
                <Row key={item.key} icon={tabIcon(item)} label={tabLabel(item)} active={item.key === activeKey} onOpen={() => go(item.to)} />
              ))}
            </Section>
          )}
          {sections.map((section) => (
            <Section key={section.id} id={section.id} label={section.label}>
              {nav
                .filter((item) => item.section === section.id)
                .map((item) => (
                  <Row
                    key={item.to}
                    icon={item.icon}
                    label={item.label}
                    active={isNavActive(item, pathname)}
                    onOpen={() => go(item.to)}
                    chip={<CountChip {...chipOf(item)} />}
                  />
                ))}
            </Section>
          ))}
        </div>

        <div className="border-t border-border/20 px-2 py-2">
          <SidebarOfficer />
        </div>
      </div>
    </aside>
  )
}
