import { documentOptions } from '@/features/documents/queries'
import { matterOptions } from '@/features/matters/queries'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { identityForLocation } from './tab-identity'
import { useWorkspace, type WorkspaceTab } from './tabs-store'

/** Navigates to a saved location such as `/matters?view=open`. */
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

/** Moving between tabs. Activating a tab is navigating to its route, since
 * the URL decides what is open; closing the tab in view moves to the tab
 * beside it (or Overview) so the route never keeps showing a closed tab. */
export function useTabActions() {
  const { tabs, activeKey, closeTab } = useWorkspace()
  const go = useGo()

  const activate = useCallback((tab: WorkspaceTab) => go(tab.to), [go])

  const close = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key)
      const tab = tabs[index]
      if (!tab || tab.kind === 'overview' || tab.pinned) return
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

/** Gives an open matter's or document's tab its own title once the record has
 * loaded. Reads the cache only (the record's own route loads it), so a tab you
 * are not looking at never costs a request. */
export function useSyncActiveTabTitle() {
  const { renameTab, tabs } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const identity = identityForLocation(pathname)
  const tabOpen = identity != null && tabs.some((tab) => tab.key === identity.key)
  const matterId = identity?.kind === 'matter' ? identity.recordId : ''
  const { data: detail } = useQuery({ ...matterOptions(matterId), enabled: false })
  const documentId = identity?.kind === 'document' ? identity.recordId : ''
  const { data: documentRecord } = useQuery({ ...documentOptions(documentId), enabled: false })

  useEffect(() => {
    if (identity?.kind === 'matter' && detail) renameTab(identity.key, detail.matter.courtNumber ?? detail.matter.title)
    if (identity?.kind === 'document' && documentRecord) renameTab(identity.key, documentRecord.reference ?? documentRecord.title)
  }, [identity?.key, identity?.kind, detail, documentRecord, renameTab, tabOpen])
}
