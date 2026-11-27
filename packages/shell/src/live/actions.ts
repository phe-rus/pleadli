import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useRef } from 'react'
import { jumpTarget, isHome, type WorkspaceTab } from '../model'
import { useWorkspace } from './context'

/** Navigates to a saved location (a path, optionally with a query). */
/** Starts loading a page's data and code without opening it, at most once every few seconds per page.
 * A sidebar row is a button, not a link, so the router's own hover preloading never sees it. */
export function useWarm() {
  const router = useRouter()
  const last = useRef(new Map<string, number>())
  return useCallback(
    (to: string) => {
      const now = Date.now()
      if (now - (last.current.get(to) ?? 0) < 4000) return
      last.current.set(to, now)
      const [path, query = ''] = to.split('?')
      void router.preloadRoute({ to: path as never, search: Object.fromEntries(new URLSearchParams(query)) as never }).catch(() => undefined)
    },
    [router],
  )
}

export function useGo() {
  const navigate = useNavigate()
  return useCallback(
    (to: string) => {
      const [path, query = ''] = to.split('?')
      void navigate({ to: path as never, search: Object.fromEntries(new URLSearchParams(query)) as never })
    },
    [navigate],
  )
}

/** Moving between tabs. Activating a tab is navigating to its route, since the
 * URL decides what is open; closing the tab in view moves to the tab beside it
 * (or the home tab) so the route never keeps showing a closed tab. */
export function useTabActions() {
  const { tabs, activeKey, closeTab, rules } = useWorkspace()
  const go = useGo()

  const activate = useCallback((tab: WorkspaceTab) => go(tab.to), [go])

  const close = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key)
      const tab = tabs[index]
      if (!tab || isHome(rules, tab) || tab.pinned) return
      if (key === activeKey) activate(tabs[index + 1] ?? tabs[index - 1] ?? tabs[0])
      closeTab(key)
    },
    [tabs, activeKey, activate, closeTab, rules],
  )

  const cycle = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return
      const index = tabs.findIndex((tab) => tab.key === activeKey)
      activate(tabs[(index + delta + tabs.length) % tabs.length])
    },
    [tabs, activeKey, activate],
  )

  const activateIndex = useCallback(
    (index: number) => {
      const tab = tabs[jumpTarget(index, tabs.length)]
      if (tab) activate(tab)
    },
    [tabs, activate],
  )

  return { activate, close, cycle, activateIndex }
}
