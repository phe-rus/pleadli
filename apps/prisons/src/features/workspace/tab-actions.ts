import { prisonerFullName, prisonerOptions } from '@/features/prisoners'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { identityForPath } from './tab-identity'
import { useWorkspace, type WorkspaceTab } from './tabs-store'

/** Moving between tabs. Activating a tab is navigating to its route, since
 * the URL decides what is open; closing the tab in view moves to the tab
 * beside it (or Today) so the route never keeps showing a closed tab. */
export function useTabActions() {
  const { tabs, activeKey, closeTab } = useWorkspace()
  const navigate = useNavigate()

  const activate = useCallback((tab: WorkspaceTab) => void navigate({ to: tab.to as never }), [navigate])

  const close = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key)
      const tab = tabs[index]
      if (!tab || tab.kind === 'today' || tab.pinned) return
      if (key === activeKey) activate(tabs[index + 1] ?? tabs[index - 1] ?? tabs[0])
      closeTab(key)
    },
    [tabs, activeKey, activate, closeTab],
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
      const tab = tabs[index === 8 ? tabs.length - 1 : index]
      if (tab) activate(tab)
    },
    [tabs, activate],
  )

  return { activate, close, cycle, activateIndex }
}

/** Gives the open prisoner's tab the person's name once the record has
 * loaded. Reads the cache only (the file's own route loads the record), so a
 * tab you are not looking at never costs a request; the name is saved with
 * the tab and shows again after a restart. */
export function useSyncActiveTabTitle(pathname: string) {
  const { renameTab, tabs } = useWorkspace()
  const identity = identityForPath(pathname)
  // The tab must exist before it can be renamed: on a direct load the record
  // can arrive before the tab is added.
  const tabOpen = identity != null && tabs.some((tab) => tab.key === identity.key)
  const prisonerId = identity?.kind === 'prisoner' ? identity.recordId : ''
  const { data: prisoner } = useQuery({ ...prisonerOptions(prisonerId), enabled: false })

  useEffect(() => {
    if (identity?.kind === 'prisoner' && prisoner) renameTab(identity.key, prisonerFullName(prisoner))
  }, [identity?.key, identity?.kind, prisoner, renameTab, tabOpen])
}
