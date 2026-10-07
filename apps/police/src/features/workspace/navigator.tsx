import * as m from '@/paraglide/messages'
import { caseFolders, isNavActive, navFor, sectionsFor, type CaseFolder, type NavItem, type NavSection } from '@/data/navigationItems'
import { StatusBarLanguageSelect } from '@/features/i18n'
import { signOut, useInstallation, useMe } from '@/features/session'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { shortcut } from '@/lib/platform'
import { ArrowDown01Icon, Folder01Icon, Logout03Icon, Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { QuickActions } from './quick-actions'
import { useStationCounts, type StationCounts } from './station-counts'
import { useGo } from './tab-actions'
import { useWorkspace, type SectionId } from './tabs-store'

/** One folding group of the sidebar, titled the way a Mac sidebar titles its
 * groups: small, quiet, and the fold arrow only when the pointer is near. */
function Section({ id, label, children }: { id: SectionId; label: string; children: ReactNode }) {
  const { sections, toggleSection } = useWorkspace()
  const open = sections[id]
  return (
    <section className="group/section flex flex-col pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`section-${id}`}
        onClick={() => toggleSection(id)}
        className="flex h-6 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-[0.6875rem] font-semibold text-muted-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {label}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn('size-3.5 shrink-0 opacity-0 transition duration-150 group-hover/section:opacity-100 motion-reduce:transition-none', !open && '-rotate-90 opacity-100')}
        />
      </button>
      <div id={`section-${id}`} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-px pt-0.5">{children}</div>
        </div>
      </div>
    </section>
  )
}

/** One place in the sidebar. The one in view is a soft tinted pill; a count
 * sits quietly at the end, and turns red only when something is overdue. */
function Row({ icon, label, active, onOpen, count, urgent = false }: { icon: NavItem['icon']; label: string; active: boolean; onOpen: () => void; count?: number; urgent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7.5 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        active ? 'bg-primary/12 font-medium text-foreground' : 'text-sidebar-foreground hover:bg-foreground/5',
      )}
    >
      <HugeiconsIcon icon={icon} className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <span className={cn('shrink-0 text-xs tabular-nums', urgent ? 'rounded-full bg-destructive px-1.5 leading-4 font-semibold text-white' : 'text-muted-foreground')}>{count > 999 ? '999+' : count}</span>
      )}
    </button>
  )
}

/** Who is signed in and where, with the few things that belong to the officer
 * rather than to the work: language, settings, signing out. */
function SidebarFooter() {
  const { data: profile } = useQuery(stationProfileOptions())
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const go = useGo()
  const initials = (me?.name ?? '')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const iconButton = 'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
  return (
    <div className="flex items-center gap-1 px-2 py-2">
      {me ? (
        <Link to="/station/officers" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 no-underline hover:bg-foreground/5">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-[0.6875rem] font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[0.8125rem] font-medium text-foreground">{[me.rank, me.name].filter(Boolean).join(' ')}</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">
              {profile?.name ?? m["workspace.not_named"]()}
              {me.role === 'admin' ? m["workspace.administrator_suffix"]() : ''}
            </span>
          </span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      <span className="text-xs text-muted-foreground">
        <StatusBarLanguageSelect />
      </span>
      <button type="button" className={iconButton} onClick={() => go('/settings')} aria-label={m["nav.settings"]()} title={m["nav.settings"]()}>
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
      </button>
      {me && (
        <button
          type="button"
          className={iconButton}
          onClick={() =>
            void signOut().finally(() => {
              queryClient.clear()
              window.location.reload()
            })
          }
          aria-label={m["workspace.sign_out"]()}
          title={m["workspace.sign_out"]()}
        >
          <HugeiconsIcon icon={Logout03Icon} className="size-4" />
        </button>
      )}
    </div>
  )
}

/** The count a place carries: work waiting, never a register's size. Custody
 * shows who is due first (in red), and only when nobody is, who is in. */
function countOf(item: NavItem, counts: StationCounts | undefined): { value: number; urgent: boolean } {
  if (!counts || !item.count) return { value: 0, urgent: false }
  if (item.count === 'inCells') return counts.custodyDue > 0 ? { value: counts.custodyDue, urgent: true } : { value: counts.inCells, urgent: false }
  if (item.count === 'stationsAttention') return { value: counts.stationsAttention, urgent: true }
  return { value: counts[item.count], urgent: false }
}

/** Open work is counted; what is closed and the whole register are not, the
 * way Mail counts unread mail and not the archive. */
function folderCount(folder: CaseFolder, counts: StationCounts | undefined) {
  if (!counts) return 0
  if (folder === 'investigating') return counts.investigating
  if (folder === 'dpp') return counts.withDpp
  return 0
}

/**
 * The sidebar, organised the way a station works. The day and the front desk
 * at the top; then the cells, the cases as folders, the papers a case gathers,
 * and the station. Search and "+" sit above it all; the officer, language and
 * Settings at the foot.
 */
export function Navigator() {
  const { leftOpen, setCommandOpen } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> })
  const go = useGo()
  const counts = useStationCounts()
  const { data: installation } = useInstallation()
  const station = installation?.mode === 'station'
  const nav = navFor(installation?.mode)
  const sections = sectionsFor(installation?.mode)

  const rows = (section: NavSection) =>
    nav
      .filter((item) => item.section === section)
      .map((item) => {
        const { value, urgent } = countOf(item, counts)
        return <Row key={item.to} icon={item.icon} label={item.label} active={isNavActive(item, pathname)} onOpen={() => go(item.to)} count={value} urgent={urgent} />
      })

  const folderView = pathname === '/investigations' ? (typeof search.view === 'string' ? search.view : 'investigating') : null

  return (
    <aside
      aria-label={m["workspace.sidebar"]()}
      inert={!leftOpen}
      className={cn('shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none print:hidden', leftOpen ? 'w-64' : 'w-0')}
    >
      <div className="flex h-full w-64 flex-col">
        {station && (
          <div className="flex items-center gap-1 px-2 pt-1 pb-1">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex h-7.5 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
              <span className="flex-1 truncate text-left">{m["workspace.search"]()}</span>
              <kbd className="font-sans text-[0.6875rem] text-muted-foreground/70">{shortcut('K')}</kbd>
            </button>
            <QuickActions />
          </div>
        )}

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
          <nav aria-label={m["workspace.places"]()} className="flex flex-col gap-px pt-2">
            {rows('main')}
          </nav>

          {sections.map((section) => (
            <Section key={section.id} id={section.id as SectionId} label={section.label}>
              {section.id === 'cases'
                ? caseFolders.map((folder) => (
                    <Row
                      key={folder.id}
                      icon={Folder01Icon}
                      label={folder.label}
                      active={folderView === folder.id}
                      onOpen={() => go(`/investigations?view=${folder.id}`)}
                      count={folderCount(folder.id, counts)}
                    />
                  ))
                : rows(section.id)}
            </Section>
          ))}

        </div>

        <SidebarFooter />
      </div>
    </aside>
  )
}
