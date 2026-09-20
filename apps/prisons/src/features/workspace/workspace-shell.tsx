import { useEffect, type FC, type PropsWithChildren } from 'react'
import { AnimatePresence } from 'motion/react'
import { useLocation } from '@tanstack/react-router'
import { usePermissions } from '@/features/session'
import { CommandMenu } from '@/components/command-menu'
import { useWorkspace, WorkspaceProvider } from './tabs-store'
import { identityForPath, tabFromIdentity } from './tab-identity'
import { TitleBar } from './titlebar'
import { Ribbon } from './ribbon'
import { StatusBar } from './statusbar'
import { Navigator } from './navigator'
import { TabStrip } from './tab-strip'
import { ContextPanel } from './context-panel'

/** Keeps the open tabs and the current record's context in step with the
 * route: each record route opens its tab the moment it is visited, and an
 * area view (no record) leaves the tab strip intact. */
export function ActiveTabSync() {
  const location = useLocation()
  const { openTab, openArea } = useWorkspace()
  const pathname = location.pathname

  useEffect(() => {
    const identity = identityForPath(pathname)
    if (identity) {
      openTab(tabFromIdentity(identity))
    } else {
      openArea({ key: pathname, kind: 'area', title: pathname === '/' ? 'Today' : pathname, to: pathname, closable: false })
    }
    // `openTab` is stable per tab key; running on every path change is what
    // keeps the tab index in step with the URL.
  }, [pathname, openTab, openArea])

  return null
}

function ShellFrame({ recordPrisonerId, children }: PropsWithChildren<{ recordPrisonerId: string | null }>) {
  const { leftOpen, contextOpen, commandOpen, setCommandOpen } = useWorkspace()
  const { can, session } = usePermissions()
  const canSearch = !session || can('prisoner.read') || can('hq.locate')

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (canSearch && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canSearch, setCommandOpen])

  return (
    <div className="h-svh w-full overflow-hidden">
      {canSearch && <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background shadow-2xl">
        <TitleBar />
        <div className="no-scrollbar flex min-h-0 flex-1">
          <Ribbon />
          <AnimatePresence initial={false}>{leftOpen && <Navigator key="navigator" />}</AnimatePresence>
          <main className="no-scrollbar flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <TabStrip />
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
          </main>
          <AnimatePresence initial={false}>
            {contextOpen && recordPrisonerId != null && <ContextPanel key="context-panel" prisonerId={recordPrisonerId} />}
          </AnimatePresence>
        </div>
        <StatusBar />
      </div>
    </div>
  )
}

/** The prisons workspace shell, framed as a desktop window: a rounded
 * surface with a drag title bar, the ribbon rail on the far left, the
 * Obsidian-style sidebar and tab strip around the working pane, and the
 * record's context sliding in on the right of it. Reads as a working space,
 * not a route directory around cards. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => {
  const location = useLocation()
  const pathname = location.pathname
  const identity = identityForPath(pathname)
  const recordPrisonerId = identity?.kind === 'prisoner' ? identity.recordId : null

  return (
    <WorkspaceProvider>
      <ActiveTabSync />
      <ShellFrame recordPrisonerId={recordPrisonerId}>{children}</ShellFrame>
    </WorkspaceProvider>
  )
}