import { SidebarUserFooter } from '@/components/sidebar-user-footer'
import { InboxList, useUnreadCount } from '@/features/notifications'
import { visibleNav } from '@/data/navigationItems'
import { useHqConfig, useSession } from '@/features/session'
import { ArrowDown01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'
import { useTabActions } from './tab-actions'
import { tabIcon } from './tab-icon'
import { identityForPath } from './tab-identity'
import { MAX_RECENTS, useWorkspace, type SectionId } from './tabs-store'
import { m } from '@/paraglide/messages'

const rowClass = 'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** One folding group of the sidebar. The fold state is remembered per
 * officer; the height eases with CSS only, and not at all when the officer
 * prefers reduced motion. */
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

function Row({ icon, label, active, onOpen }: { icon: typeof Search01Icon; label: string; active: boolean; onOpen: () => void }) {
  return (
    <div className={cn('flex items-center rounded-md transition-colors duration-100 hover:bg-secondary/70 motion-reduce:transition-none', active && 'bg-secondary text-primary')}>
      <button type="button" onClick={onOpen} aria-current={active ? 'page' : undefined} className={cn(rowClass, active && 'font-medium')}>
        <HugeiconsIcon icon={icon} className="size-4.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
    </div>
  )
}

function useAreas() {
  const { data: hqConfig } = useHqConfig()
  const permissions = useSession().data?.permissions
  return useMemo(() => {
    const nav = visibleNav(hqConfig?.isHeadOffice ?? false, permissions)
    // Today is the first tab and has its own ribbon button, so it is not
    // listed twice.
    return nav.flatMap((item) => [...(item.children ?? []), ...(item.to ? [item] : [])]).filter((item) => item.to && item.to !== '/')
  }, [hqConfig?.isHeadOffice, permissions])
}

/** Workspace or inbox: the sidebar shows one at a time, like the side tabs of
 * a file explorer. Choosing the inbox does not navigate: the list appears,
 * and choosing a message opens it in the content view. */
function ViewSwitch() {
  const { sidebarView, setSidebarView } = useWorkspace()
  const { data: unread = 0 } = useUnreadCount()
  const option = (view: 'workspace' | 'inbox', label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={sidebarView === view}
      onClick={() => setSidebarView(view)}
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm py-0.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        sidebarView === view ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count ? <span className="rounded-full bg-primary px-1.5 text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums">{count > 99 ? '99+' : count}</span> : null}
    </button>
  )
  return (
    <div role="tablist" aria-label={m.shell_sidebar_view()} className="mx-2 mb-1 flex gap-0.5 rounded-md bg-background p-0.5">
      {option('workspace', m.shell_view_workspace())}
      {option('inbox', m.shell_view_inbox(), unread)}
    </div>
  )
}

/** The left sidebar: where you have been and what is open, with the areas
 * folded to a compact map underneath. Small and contextual on purpose. The
 * main ways in are search, quick actions and tabs. */
export function Navigator() {
  const navigate = useNavigate()
  const { tabs, recents, activeKey, leftOpen, setCommandOpen, sidebarView } = useWorkspace()
  const selectedMessage = useLocation({ select: (location) => (typeof (location.search as { item?: unknown }).item === 'string' ? (location.search as { item: string }).item : undefined) })
  const inboxView = sidebarView === 'inbox'
  const { activate } = useTabActions()
  const areas = useAreas()

  // Pinned holds what was pinned. Recent is what was opened last, three at
  // most: every open tab is already in the title bar, so the sidebar does not
  // list them a second time.
  const pinned = tabs.filter((tab) => tab.pinned && tab.kind !== 'today')
  const recent = recents.slice(0, MAX_RECENTS)

  return (
    <aside
      aria-label={m.shell_sidebar()}
      inert={!leftOpen}
      className={cn('shrink-0 overflow-hidden print:hidden bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none', leftOpen ? 'w-78' : 'w-0')}
    >
      <div className="flex h-full w-78 flex-col">
        <div className="px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-background px-2 text-xs text-muted-foreground transition-colors outline-none hover:border-border/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
            <span className="truncate">{m.shell_search_placeholder()}</span>
          </button>
        </div>

        <ViewSwitch />

        {inboxView ? (
          <InboxList selectedId={selectedMessage} onSelect={(id) => void navigate({ to: '/inbox', search: { item: id } })} />
        ) : (
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pt-1 pb-2">
          {recent.length > 0 && (
            <Section id="recent" label={m.shell_section_recent()}>
              {recent.map((item) => (
                <Row key={item.key} icon={tabIcon(item)} label={item.title} active={item.key === activeKey} onOpen={() => void navigate({ to: item.to as never })} />
              ))}
            </Section>
          )}
          {pinned.length > 0 && (
            <Section id="pinned" label={m.shell_section_pinned()}>
              {pinned.map((tab) => (
                <Row key={tab.key} icon={tabIcon(tab)} label={tab.title} active={tab.key === activeKey} onOpen={() => activate(tab)} />
              ))}
            </Section>
          )}
          {(recent.length > 0 || pinned.length > 0) && <div aria-hidden className="mx-2 my-1 border-t border-border/50" />}
          <Section id="areas" label={m.shell_section_areas()}>
            {areas.map((area) => (
              <Row key={area.to} icon={area.icon} label={area.label} active={identityForPath(area.to!)?.key === activeKey} onOpen={() => void navigate({ to: area.to as never })} />
            ))}
          </Section>
        </div>
        )}

        <div className="border-t border-border/20 px-2 py-2">
          <SidebarUserFooter />
        </div>
      </div>
    </aside>
  )
}
