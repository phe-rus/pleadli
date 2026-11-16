import { ConnectionIndicator } from '@/features/connectivity'
import { SidebarLanguageSelect } from '@/features/i18n'
import { useUnreadCount } from '@/features/notifications'
import { OfficerAvatar, officerRoleLabel } from '@/features/officers'
import { prisonerFolders, prisonersOptions } from '@/features/prisoners'
import { visibleNav, type SidebarNavItem } from '@/data/navigationItems'
import { useHqConfig, usePermissions, useSession, useSignOut } from '@/features/session'
import { ArrowDown01Icon, DashboardBrowsingIcon, Folder01Icon, Logout03Icon, Notification01Icon, Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'
import { QuickActions } from './quick-actions'
import { useGo } from './tab-actions'
import { tabIcon } from './tab-icon'
import { useWorkspace, type SectionId } from './tabs-store'
import { shortcut } from '@/lib/platform'
import { m } from '@/paraglide/messages'

/** One folding group of the sidebar, titled the way a Mac sidebar titles its
 * groups: small, quiet, and the fold arrow only when the pointer is near. */
function Section({ id, label, children }: { id: SectionId; label: string; children: ReactNode }) {
  const { sections, toggleSection } = useWorkspace()
  const open = sections[id] ?? true
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
 * sits quietly at the end, and turns red only when something is owed. */
function Row({ icon, label, active, onOpen, count, urgent = false }: { icon: SidebarNavItem['icon']; label: string; active: boolean; onOpen: () => void; count?: number; urgent?: boolean }) {
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

/** Who is working here, with the few things that belong to the person rather
 * than to the work: the link to Head Office, settings, signing out. */
function SidebarFooter() {
  const { data: session } = useSession()
  const signOut = useSignOut()
  const go = useGo()
  const iconButton = 'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
  if (!session) return null
  const { officer } = session
  return (
    <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
      <div className="px-2.5 text-xs text-muted-foreground">
        <ConnectionIndicator />
      </div>
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1">
          <OfficerAvatar officer={officer} size={28} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[0.8125rem] font-medium text-foreground">{officer.name}</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">{m.ui_badge({ badgeNumber: officer.badgeNumber, role: officerRoleLabel(officer.role) })}</span>
          </span>
        </div>
        <SidebarLanguageSelect />
        <button type="button" className={iconButton} onClick={() => go('/settings')} aria-label={m.shell_settings()} title={m.shell_settings()}>
          <HugeiconsIcon icon={Settings01Icon} className="size-4" />
        </button>
        <button type="button" className={iconButton} onClick={() => signOut.mutate()} disabled={signOut.isPending} aria-label={m.shell_sign_out()} title={m.shell_sign_out()}>
          <HugeiconsIcon icon={Logout03Icon} className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** The name each place goes by in the sidebar, the words a prison uses. */
function sidebarName(to: string, fallback: string, headOffice: boolean) {
  if (to === '/legal') return m.nav_court()
  if (to === '/requests') return m.nav_requests()
  if (to === '/reports') return headOffice ? m.nav_returns_statistics() : m.nav_registers()
  if (headOffice && to === '/facilities') return m.nav_regions_prisons()
  if (headOffice && to === '/officers') return m.nav_staff()
  return fallback
}

/** Where each area sits. A prison works by its people first, so they lead,
 * sorted into folders; then the day's work; then the prison itself. Head
 * Office has no prisoners of its own and keeps its network and its staff. */
const groups: Record<'facility' | 'hq', { id: SectionId; label: () => string; paths: string[] }[]> = {
  facility: [
    { id: 'work', label: () => m.shell_section_the_day(), paths: ['/legal', '/movements', '/visits', '/requests'] },
    { id: 'prison', label: () => m.shell_section_the_prison(), paths: ['/reports', '/officers'] },
  ],
  hq: [
    { id: 'work', label: () => m.hq_section_service(), paths: ['/facilities'] },
    { id: 'prison', label: () => m.hq_section_headquarters(), paths: ['/reports', '/officers'] },
  ],
}

/**
 * The sidebar, organised the way the work is. At the top Today and the
 * inbox; then the prisoners in folders, each with how many are in it; then
 * the work and the prison. Search and "+" sit above it all.
 */
export function Navigator() {
  const { tabs, activeKey, leftOpen, setCommandOpen } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const view = useLocation({ select: (location) => (location.search as { view?: unknown }).view })
  const go = useGo()
  const { data: hqConfig } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false
  const { can, session } = usePermissions()
  const canSeePrisoners = !isHeadOffice && (!session || can('prisoner.read'))
  const { data: unread = 0 } = useUnreadCount()
  const { data: prisoners = [] } = useQuery({ ...prisonersOptions(''), enabled: canSeePrisoners })

  // Areas the officer may open, by path, so each group only lists what exists for them.
  const areas = useMemo(() => {
    const flat = visibleNav(isHeadOffice, session?.permissions).flatMap((item) => [item, ...(item.children ?? [])])
    return new Map(flat.filter((item) => item.to).map((item) => [item.to!, item]))
  }, [isHeadOffice, session?.permissions])

  const pinned = tabs.filter((tab) => tab.pinned && tab.kind !== 'today')
  const isAt = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  return (
    <aside
      aria-label={m.shell_sidebar()}
      inert={!leftOpen}
      className={cn('min-h-0 w-64 shrink-0 overflow-hidden print:hidden')}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center gap-1 px-2 pt-1 pb-1">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-7.5 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{m.shell_search_short()}</span>
            <kbd className="font-sans text-[0.6875rem] text-muted-foreground/70">{shortcut('K')}</kbd>
          </button>
          <QuickActions />
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
          <nav aria-label={m.shell_sidebar()} className="flex flex-col gap-px pt-2">
            <Row icon={DashboardBrowsingIcon} label={m.shell_today()} active={pathname === '/'} onOpen={() => go('/')} />
            <Row icon={Notification01Icon} label={m.nav_inbox()} active={isAt('/inbox')} onOpen={() => go('/inbox')} count={unread} />
          </nav>

          {canSeePrisoners && (
            <Section id="prisoners" label={m.shell_section_prisoners()}>
              {prisonerFolders.map((folder) => (
                <Row
                  key={folder.id}
                  icon={Folder01Icon}
                  label={folder.label()}
                  active={pathname === '/prisoners' && (typeof view === 'string' ? view : 'held') === folder.id}
                  onOpen={() => go(folder.id === 'held' ? '/prisoners' : `/prisoners?view=${folder.id}`)}
                  count={folder.counted ? prisoners.filter(folder.match).length : 0}
                  urgent={folder.urgent}
                />
              ))}
            </Section>
          )}

          {groups[isHeadOffice ? 'hq' : 'facility'].map((group) => {
            const items = group.paths.flatMap((to) => (areas.has(to) ? [areas.get(to)!] : []))
            if (items.length === 0) return null
            return (
              <Section key={group.id} id={group.id} label={group.label()}>
                {items.map((item) => (
                  <Row key={item.to} icon={item.icon} label={sidebarName(item.to!, item.label, isHeadOffice)} active={isAt(item.to!)} onOpen={() => go(item.to!)} />
                ))}
              </Section>
            )
          })}

          {pinned.length > 0 && (
            <Section id="pinned" label={m.shell_section_pinned()}>
              {pinned.map((tab) => (
                <Row key={tab.key} icon={tabIcon(tab)} label={tab.title} active={tab.key === activeKey} onOpen={() => go(tab.to)} />
              ))}
            </Section>
          )}
        </div>

        <SidebarFooter />
      </div>
    </aside>
  )
}
