import { CommandMenu } from '@/components/command-menu'
import { Controls } from '@/components/toolbar/controls'
import { useLocaleFromProfile } from '@/features/i18n'
import { useHqConfig, usePermissions, useSession } from '@/features/session'
import { useLocation } from '@tanstack/react-router'
import { useEffect, useRef, type FC, type PropsWithChildren } from 'react'
import { AssistantProvider } from './assistant/assistant-store'
import { CenterHeader } from './center-header'
import { LeftPillar } from './left-pillar'
import { RightPanel } from './right-panel'
import { StatusBar } from './statusbar'
import { useSyncActiveTabTitle, useTabActions } from './tab-actions'
import { identityForPath, tabFromIdentity } from './tab-identity'
import { useWorkspace, WorkspaceProvider } from './tabs-store'

/** Keeps the open tabs in step with the route: every path that is an area,
 * a prisoner's file or a procedure opens (or focuses) its tab the moment it
 * is visited, however it was reached. */
function ActiveTabSync({ pathname }: { pathname: string }) {
  const { openTab, setSidebarView, setLeftOpen, rightLocked, setRightOpen } = useWorkspace()
  const locked = useRef(rightLocked)
  locked.current = rightLocked
  const { data: hqConfig } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false
  useSyncActiveTabTitle(pathname)

  useEffect(() => {
    const identity = identityForPath(pathname)
    if (identity) openTab(tabFromIdentity(identity, isHeadOffice))
    // Opening the inbox, from anywhere, brings its message list into the sidebar.
    if (pathname === '/inbox') {
      setSidebarView('inbox')
      setLeftOpen(true)
    }
  }, [pathname, isHeadOffice, openTab, setSidebarView, setLeftOpen])

  // Moving to another tab folds the right pillar away, unless it is locked.
  useEffect(() => {
    if (!locked.current) setRightOpen(false)
  }, [pathname, setRightOpen])

  return null
}

/** Ctrl K opens search. Ctrl J opens the assistant, or folds it away. Ctrl W closes the tab in view, Ctrl Tab and
 * Ctrl Shift Tab move along the tabs, Ctrl 1 to 9 jump to one (9 is the
 * last). Nothing fires while the palette is open. */
function useShellShortcuts() {
  const { activeKey, commandOpen, setCommandOpen, toggleRight } = useWorkspace()
  const { close, cycle, activateIndex } = useTabActions()
  const { can, session } = usePermissions()
  const canSearch = !session || can('prisoner.read') || can('hq.locate')

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k' && canSearch) {
        event.preventDefault()
        setCommandOpen((prev) => !prev)
      } else if (commandOpen) {
        return
      } else if (key === 'j') {
        event.preventDefault()
        toggleRight('assistant')
      } else if (key === 'w' && activeKey) {
        event.preventDefault()
        close(activeKey)
      } else if (key === 'tab') {
        event.preventDefault()
        cycle(event.shiftKey ? -1 : 1)
      } else if (/^[1-9]$/.test(key)) {
        event.preventDefault()
        activateIndex(Number(key) - 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canSearch, commandOpen, activeKey, setCommandOpen, toggleRight, close, cycle, activateIndex])

  return canSearch
}

function ShellFrame({ prisonerId, children }: { prisonerId: string | null; children: React.ReactNode }) {
  const { commandOpen, setCommandOpen, rightOpen } = useWorkspace()
  const canSearch = useShellShortcuts()
  // The window's buttons belong at the window's own top-right corner: in the
  // right pillar's header while it is open, in the centre header otherwise.
  const controls = <Controls />

  return (
    <div className="h-svh w-full overflow-hidden print:h-auto print:overflow-visible">
      {canSearch && <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background shadow-2xl print:block print:h-auto print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="flex min-h-0 flex-1 print:block">
          <LeftPillar />
          <div className="flex min-w-0 flex-1 flex-col print:block">
            <CenterHeader controls={rightOpen ? null : controls} />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background print:block print:overflow-visible">
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
            </main>
          </div>
          <RightPanel prisonerId={prisonerId} controls={rightOpen ? controls : null} />
        </div>
        <StatusBar />
      </div>
    </div>
  )
}

/** The prisons workspace: three columns, each with a header of its own. The
 * left pillar (ribbon and sidebar) and the right pillar (assistant and record
 * context) run the full height like piers; between them the centre holds the
 * tabs over the page, and grows back when either pillar folds away. Together
 * the three headers read as one bar. What is open is remembered per officer. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: session } = useSession()
  useLocaleFromProfile()
  // Held until the officer is known so the workspace that opens is theirs.
  if (!session) return null

  const identity = identityForPath(pathname)
  const prisonerId = identity?.kind === 'prisoner' ? identity.recordId : null

  return (
    <WorkspaceProvider key={session.officer.id} storageKey={`pleadli:prisons:workspace:v2:${session.officer.id}`}>
      <AssistantProvider>
        <ActiveTabSync pathname={pathname} />
        <ShellFrame prisonerId={prisonerId}>{children}</ShellFrame>
      </AssistantProvider>
    </WorkspaceProvider>
  )
}
