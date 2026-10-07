import * as m from '@/paraglide/messages'
import { isNavActive, lawyersNav, type NavItem, type NavSection } from '@/data/navigationItems'
import { StatusBarLanguageSelect } from '@/features/i18n'
import { signOut, useSessionStatus, useUsagesEnabled } from '@/features/installation'
import { overviewOptions } from '@/features/overview'
import { useProfile } from '@/features/profile'
import { shortcut } from '@/lib/platform'
import { ArrowDown01Icon, Logout03Icon, Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { QuickActions } from './quick-actions'
import { useGo } from './tab-actions'
import { tabIcon } from './tab-icon'
import { tabLabel } from './tab-identity'
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

/** Who practises here, with the few things that belong to the person rather
 * than to the work: language, settings, signing out. */
function SidebarFooter() {
  const { data: profile } = useProfile()
  const { data: session } = useSessionStatus()
  const queryClient = useQueryClient()
  const go = useGo()
  const name = profile?.name ?? session?.actor?.name
  const detail = profile?.firm ?? session?.actor?.title ?? m["workspace.advocate"]()
  const initials = (name ?? '')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const iconButton = 'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
  return (
    <div className="flex items-center gap-1 px-2 py-2">
      <Link to="/settings/$section" params={{ section: 'you' }} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 no-underline hover:bg-foreground/5">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-[0.6875rem] font-semibold text-primary-foreground">
          {initials || '·'}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[0.8125rem] font-medium text-foreground">{name ?? m["workspace.no_advocate"]()}</span>
          <span className="truncate text-[0.6875rem] text-muted-foreground">{detail}</span>
        </span>
      </Link>
      <span className="text-xs text-muted-foreground">
        <StatusBarLanguageSelect />
      </span>
      <button type="button" className={iconButton} onClick={() => go('/settings')} aria-label={m["nav.settings"]()} title={m["nav.settings"]()}>
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
      </button>
      {session?.actor && session.level && session.level !== 'none' && (
        <button
          type="button"
          className={iconButton}
          onClick={() => void signOut().then(() => queryClient.invalidateQueries({ queryKey: ['session'] }))}
          aria-label={m["session.sign_out"]()}
          title={m["session.sign_out"]()}
        >
          <HugeiconsIcon icon={Logout03Icon} className="size-4" />
        </button>
      )}
    </div>
  )
}

/**
 * The sidebar, organised the way the work is. At the top what is on today;
 * then the matters in folders, each with how many need you; then the office.
 * What was opened lately is one place (Recent), as Finder has Recents.
 * Search and "+" sit above it all.
 */
export function Navigator() {
  const { tabs, activeKey, leftOpen, setCommandOpen } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> })
  const go = useGo()
  const { data: today } = useQuery(overviewOptions())
  const { data: usages } = useUsagesEnabled()

  const pinned = tabs.filter((tab) => tab.pinned && tab.kind !== 'overview')
  const countOf = (item: NavItem) => (today && item.count ? today.counts[item.count] : 0)

  const rows = (section: NavSection) =>
    lawyersNav
      .filter((item) => item.section === section && (!item.usage || usages?.includes(item.usage)))
      .map((item) => (
        <Row
          key={`${item.to}${item.search ? `?${new URLSearchParams(item.search)}` : ''}`}
          icon={item.icon}
          label={item.label}
          active={isNavActive(item, pathname, search)}
          onOpen={() => go(item.search ? `${item.to}?${new URLSearchParams(item.search)}` : item.to)}
          count={countOf(item)}
          // Hearings left unclosed and overdue tasks are late; the rest is only how many.
          urgent={item.count === 'notClosed' || item.count === 'tasksOverdue'}
        />
      ))

  return (
    <aside
      aria-label={m["workspace.sidebar"]()}
      inert={!leftOpen}
      className={cn('shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none print:hidden', leftOpen ? 'w-64' : 'w-0')}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center gap-1 px-2 pt-1 pb-1">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-7.5 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{m["workspace.search_short"]()}</span>
            <kbd className="font-sans text-[0.6875rem] text-muted-foreground/70">{shortcut('K')}</kbd>
          </button>
          <QuickActions />
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
          <nav aria-label={m["workspace.places"]()} className="flex flex-col gap-px pt-2">
            {rows('main')}
          </nav>

          <Section id="matters" label={m["nav.section.matters"]()}>
            {rows('matters')}
          </Section>

          <Section id="office" label={m["nav.section.office"]()}>
            {rows('office')}
          </Section>

          {pinned.length > 0 && (
            <Section id="pinned" label={m["nav.pinned"]()}>
              {pinned.map((tab) => (
                <Row key={tab.key} icon={tabIcon(tab)} label={tabLabel(tab)} active={tab.key === activeKey} onOpen={() => go(tab.to)} />
              ))}
            </Section>
          )}
        </div>

        <SidebarFooter />
      </div>
    </aside>
  )
}
