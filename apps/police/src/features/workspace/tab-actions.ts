import { caseWorkspaceOptions } from '@/features/cases/queries'
import { chargeSheetAccusedName } from '@/features/legal-forms/schema'
import { chargeSheetsOptions } from '@/features/legal-forms/queries'
import { personProfileOptions } from '@/features/people/queries'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { identityForLocation } from './tab-identity'
import { useWorkspace, type WorkspaceTab } from './tabs-store'

/** Navigates to a saved location. */
export function useGo() {
  const navigate = useNavigate()
  return useCallback(
    (to: string) => {
      void navigate({ to: to.split('?')[0] as never })
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

/** Gives an open record's tab its own name once the record has loaded: a
 * case's reference, a person's name, a charge sheet's accused. Reads the cache
 * only (the record's own route loads it), so a tab you are not looking at never
 * costs a request. */
export function useSyncActiveTabTitle() {
  const { renameTab, tabs } = useWorkspace()
  const pathname = useLocation({ select: (location) => location.pathname })
  const identity = identityForLocation(pathname)
  const tabOpen = identity != null && tabs.some((tab) => tab.key === identity.key)
  const recordId = identity && 'recordId' in identity ? identity.recordId : ''

  const { data: workspace } = useQuery({ ...caseWorkspaceOptions(recordId), enabled: false })
  const { data: profile } = useQuery({ ...personProfileOptions(recordId), enabled: false })
  const { data: sheets } = useQuery({ ...chargeSheetsOptions(''), enabled: false })

  useEffect(() => {
    if (!identity) return
    if (identity.kind === 'case' && workspace) renameTab(identity.key, workspace.case.reference)
    if (identity.kind === 'person' && profile) renameTab(identity.key, [profile.person.firstName, profile.person.lastName].filter(Boolean).join(' '))
    if (identity.kind === 'chargesheet' && sheets) {
      const sheet = sheets.find((s) => s.id === identity.recordId)
      if (sheet) renameTab(identity.key, chargeSheetAccusedName(sheet) ?? sheet.caseReference)
    }
  }, [identity?.key, identity?.kind, workspace, profile, sheets, renameTab, tabOpen])
}
