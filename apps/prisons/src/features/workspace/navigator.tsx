import { SidebarUserFooter } from '@/components/sidebar-user-footer'
import { visibleNav } from '@/data/navigationItems'
import { useHqConfig, useSession } from '@/features/session'
import {
  Clock01Icon,
  CommandIcon,
  Layers01Icon,
  PinIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { motion } from 'motion/react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
import { useMemo } from 'react'
import { useWorkspace } from './tabs-store'
import { identityForPath, tabFromIdentity, useTabTitle } from './tab-identity'

const SIDEBAR_WIDTH = 240

/** A stable, never-rendered stand-in so the live-title hook stays
 * unconditional even when no record is in context. */
const DEFAULT_TAB = {
  key: '__none__',
  kind: 'today' as const,
  title: '',
  to: '/',
  closable: false,
}

/** A compact destination list, not the areas' content: workspaces are
 * reached as destinations, the detail lives in tabs. */
function WorkspaceList({ isHeadOffice }: { isHeadOffice: boolean }) {
  const permissions = useSession().data?.permissions
  const nav = useMemo(() => visibleNav(isHeadOffice, permissions), [isHeadOffice, permissions])
  const location = useLocation()
  const navigate = useNavigate()
  const { openArea } = useWorkspace()

  const groups: { section: string | undefined; rows: { label: string; to: string; icon: any; exact?: boolean }[] }[] = []
  for (const item of nav) {
    const rows = [
      ...(item.children ?? []).map((c) => ({ label: c.label, to: c.to!, icon: c.icon, exact: c.exact })),
      ...(item.to ? [{ label: item.label, to: item.to, icon: item.icon, exact: item.exact }] : []),
    ]
    const last = groups[groups.length - 1]
    if (last && last.section === item.section) last.rows.push(...rows)
    else groups.push({ section: item.section, rows })
  }

  return (
    <div className="flex w-full flex-col gap-px">
      {groups.map((group) => (
        <div key={group.section ?? 'areas'} className="flex flex-col gap-px">
          {group.section && (
            <span className="px-1.5 pt-1 pb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {group.section}
            </span>
          )}
          {group.rows.map((row) => {
            const isCurrent =
              location.pathname === row.to ||
              (row.exact === false || !row.exact
                ? location.pathname.startsWith(row.to) && row.to !== '/'
                : location.pathname === row.to)
            return (
              <button
                key={row.to}
                type="button"
                onClick={() => {
                  openArea({ key: row.to, kind: 'area', title: row.label, to: row.to, closable: false })
                  void navigate({ to: row.to as never })
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-sm text-left',
                  'transition-colors duration-150 ease-out hover:bg-secondary/70',
                  isCurrent && 'bg-secondary text-primary font-medium',
                )}
              >
                <HugeiconsIcon icon={row.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RecentList() {
  const { recents, isActive, openTab, openArea } = useWorkspace()
  const navigate = useNavigate()
  if (recents.length === 0) return null
  return (
    <div className="flex w-full flex-col gap-px">
      {recents.slice(0, 3).map((recent) => {
        const identity = identityForPath(recent.to)
        const isRecord = identity != null
        return (
          <button
            key={recent.key}
            type="button"
            onClick={() => {
              if (identity) {
                const tab = tabFromIdentity(identity)
                openTab({ ...tab, title: recent.title, subtitle: recent.subtitle })
              } else {
                openArea({ key: recent.key, kind: 'area', title: recent.title, subtitle: recent.subtitle, to: recent.to, closable: false })
              }
              void navigate({ to: recent.to as never })
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-sm text-left',
              'transition-colors duration-150 ease-out hover:bg-secondary/70',
              isActive(recent.key) && 'bg-secondary text-primary font-medium',
            )}
          >
            <HugeiconsIcon icon={isRecord ? Layers01Icon : Clock01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{recent.title}</span>
          </button>
        )
      })}
    </div>
  )
}

function CurrentContext() {
  const { tabs, activeKey, setActive, isActive, isOpen, currentContext, setCommandOpen } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = tabs.find((tab) => tab.key === activeKey)
  const identity = identityForPath(location.pathname)

  const record = activeTab && (activeTab.kind === 'prisoner' || activeTab.kind === 'procedure') ? activeTab : null
  const recordTitle = useTabTitle(record ?? DEFAULT_TAB)
  if (!record && !currentContext) return null

  return (
    <div className="flex flex-col gap-1 border-t border-border/70 pt-2">
      <span className="px-1 mb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">In context</span>
      {record && (
        <button
          type="button"
          onClick={() => {
            setActive(record.key)
            void navigate({ to: record.to as never })
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-sm text-left',
            'transition-colors duration-150 ease-out hover:bg-secondary/70',
            isActive(record.key) && 'bg-secondary text-primary font-medium',
          )}
        >
          <HugeiconsIcon icon={Layers01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{recordTitle}</span>
          {record.subtitle && <span className="shrink-0 text-xs text-muted-foreground">{record.subtitle}</span>}
        </button>
      )}
      {currentContext}
      {identity && isOpen(identity.key) && (
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex w-fit items-center gap-1 px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <HugeiconsIcon icon={CommandIcon} className="size-3.5" />
          Open a connected record
        </button>
      )}
    </div>
  )
}

/** The left sidebar: an Obsidian-style file explorer over the working set.
 * A search field opens the command palette, RECENT / PINNED / WORKSPACE
 * hold the surfaced destinations, and the signed-in officer's context sits
 * at the foot. Collapsing animates the pane away on the horizontal axis,
 * while the ribbon keeps the quick actions reachable. */
export function Navigator() {
  const { setCommandOpen } = useWorkspace()
  const { data: hqConfig } = useHqConfig()

  return (
    <motion.div
      key="navigator"
      data-context-name="left-sidebar"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="flex shrink-0 flex-col overflow-hidden border-r border-border/20 bg-background"
      aria-label="Sidebar"
    >
      <div className="flex h-full w-60 min-w-60 flex-col">
        <div className="px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-background px-2 text-xs text-muted-foreground hover:border-border/80 hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
            <span className="truncate">Search or run command…</span>
          </button>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2 pt-1 pb-2">
          <div className="flex w-full flex-col gap-0.5">
            <span className="px-1.5 mb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">Recent</span>
            <RecentList />
          </div>
          <div className="flex w-full flex-col gap-0.5 border-t border-border/40 pt-2">
            <span className="px-1.5 mb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">Workspace</span>
            <WorkspaceList isHeadOffice={hqConfig?.isHeadOffice ?? false} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 border-t border-border/20 px-2 py-1.5">
          <CurrentContext />
          <SidebarUserFooter />
        </div>
      </div>
    </motion.div>
  )
}