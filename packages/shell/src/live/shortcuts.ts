import { useEffect } from 'react'
import { shortcutFor } from '../model'
import { useTabActions } from './actions'
import { useWorkspace } from './context'

/** The event a form listens for to save itself. Ctrl S (⌘S) sends it to the
 * focused element, where it bubbles up through the form to the window, so a form
 * can listen on itself and a page can listen on the window. */
export const SAVE_EVENT = 'pleadli:save'

/** Ctrl K opens search, Ctrl W closes the tab in view, Ctrl Tab and Ctrl Shift
 * Tab move along the tabs, Ctrl 1 to 9 jump to one (9 is the last), Ctrl T opens
 * the + menu, Ctrl S saves the focused form. Nothing but Ctrl K fires while
 * search is open, and Ctrl K does nothing where search is switched off. */
export function useShellShortcuts(searchEnabled: boolean) {
  const { config, activeKey, searchOpen, setSearchOpen, setQuickAddOpen } = useWorkspace()
  const { close, cycle, activateIndex } = useTabActions()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const action = shortcutFor(event, { searchEnabled, searchOpen })
      if (!action) {
        if (!searchOpen && config.onShortcut?.(event)) event.preventDefault()
        return
      }
      event.preventDefault()
      switch (action.type) {
        case 'search':
          setSearchOpen((prev) => !prev)
          break
        case 'close':
          if (activeKey) close(activeKey)
          break
        case 'cycle':
          cycle(action.delta)
          break
        case 'jump':
          activateIndex(action.index)
          break
        case 'quick-add':
          setQuickAddOpen(true)
          break
        case 'save':
          ;(document.activeElement ?? document.body).dispatchEvent(new CustomEvent(SAVE_EVENT, { bubbles: true }))
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [config, searchEnabled, searchOpen, activeKey, setSearchOpen, setQuickAddOpen, close, cycle, activateIndex])
}
