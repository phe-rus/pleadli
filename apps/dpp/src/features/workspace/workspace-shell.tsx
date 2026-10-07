import { CommandMenu } from '@/components/command-menu'
import { useIntakeAlerts } from '@/hooks/use-intake-alerts'
import { useLocation } from '@tanstack/react-router'
import { useEffect, useRef, type FC, type PropsWithChildren } from 'react'
import { CenterHeader } from './center-header'
import { LeftPillar } from './left-pillar'
import { AssistDock } from '@/features/assist/dock'
import { useSyncActiveTabTitle, useTabActions } from './tab-actions'
import { identityForLocation, tabFromIdentity } from './tab-identity'
import { useWorkspace, WorkspaceProvider } from './tabs-store'

/** Keeps the open tabs in step with the route: every location that is an area
 * or a file opens (or focuses) its tab the moment it is visited, however it
 * was reached. */
function ActiveTabSync() {
  const { openTab } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> })
  useSyncActiveTabTitle()

  const view = typeof search.view === 'string' ? search.view : ''
  const kind = typeof search.kind === 'string' ? search.kind : ''
  useEffect(() => {
    const identity = identityForLocation(pathname, { view, kind })
    if (identity) openTab(tabFromIdentity(identity))
  }, [pathname, view, kind, openTab])

  return null
}

/** Ctrl K opens search. Ctrl W closes the tab in view, Ctrl Tab and Ctrl Shift
 * Tab move along the tabs, Ctrl 1 to 9 jump to one (9 is the last). Nothing
 * fires while the palette is open. */
function useShellShortcuts() {
  const { activeKey, commandOpen, setCommandOpen } = useWorkspace()
  const { close, cycle, activateIndex } = useTabActions()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setCommandOpen((prev) => !prev)
      } else if (commandOpen) {
        return
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
  }, [commandOpen, activeKey, setCommandOpen, close, cycle, activateIndex])
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { commandOpen, setCommandOpen } = useWorkspace()
  useShellShortcuts()
  // A new place opens at its top, as a Mac window does; switching views inside one place (its search) keeps the position.
  const scroller = useRef<HTMLDivElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [pathname])
  useIntakeAlerts()

  return (
    <div className="h-svh w-full overflow-hidden print:h-auto print:overflow-visible">
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <div className="flex h-full w-full flex-col overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
        <div className="flex min-h-0 flex-1 print:block">
          <LeftPillar />
          <div className="flex min-w-0 flex-1 flex-col print:block">
            <CenterHeader />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background print:block print:overflow-visible">
              <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
            </main>
          </div>
          <AssistDock />
        </div>
      </div>
    </div>
  )
}

/** The DPP workspace: a left pillar (ribbon and sidebar) running the full
 * height, and the centre holding the tabs over the page. It grows back when the
 * sidebar folds away. What is open is remembered on this machine. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => (
  <WorkspaceProvider storageKey="pleadli:dpp:workspace:v1">
    <ActiveTabSync />
    <ShellFrame>{children}</ShellFrame>
  </WorkspaceProvider>
)
