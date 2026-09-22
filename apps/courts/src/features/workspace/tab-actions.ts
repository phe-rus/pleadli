import { caseOptions } from '@/features/cases/queries'
import { libraryItemOptions } from '@/features/library/queries'
import { orderOptions } from '@/features/orders/queries'
import { rulingOptions } from '@/features/rulings/queries'
import { sittingOptions } from '@/features/sitting-record/queries'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { identityForLocation } from './tab-identity'
import { useWorkspace, type WorkspaceTab } from './tabs-store'

/** Navigates to a saved location such as `/cases?view=open`. */
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

/** Gives an open case's or order's tab its own title once the record has
 * loaded. Reads the cache only (the record's own route loads it), so a tab you
 * are not looking at never costs a request. */
export function useSyncActiveTabTitle() {
  const { renameTab, tabs } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const identity = identityForLocation(pathname)
  const tabOpen = identity != null && tabs.some((tab) => tab.key === identity.key)
  const caseId = identity?.kind === 'case' ? identity.recordId : ''
  const { data: detail } = useQuery({ ...caseOptions(caseId), enabled: false })
  const orderId = identity?.kind === 'order' ? identity.recordId : ''
  const { data: order } = useQuery({ ...orderOptions(orderId), enabled: false })
  const sittingId = identity?.kind === 'sitting' ? identity.recordId : ''
  const { data: sitting } = useQuery({ ...sittingOptions(sittingId), enabled: false })
  const rulingId = identity?.kind === 'ruling' ? identity.recordId : ''
  const { data: ruling } = useQuery({ ...rulingOptions(rulingId), enabled: false })
  const libraryId = identity?.kind === 'reference' ? identity.recordId : ''
  const { data: text } = useQuery({ ...libraryItemOptions(libraryId), enabled: false })

  useEffect(() => {
    if (identity?.kind === 'case' && detail) renameTab(identity.key, detail.case.courtNumber)
    if (identity?.kind === 'order' && order) renameTab(identity.key, order.reference ?? order.title)
    if (identity?.kind === 'sitting' && sitting) renameTab(identity.key, `${sitting.case.courtNumber} sitting`)
    if (identity?.kind === 'ruling' && ruling) renameTab(identity.key, ruling.reference ?? ruling.title)
    if (identity?.kind === 'reference' && text) renameTab(identity.key, text.title)
  }, [identity?.key, identity?.kind, detail, order, sitting, ruling, text, renameTab, tabOpen])
}
