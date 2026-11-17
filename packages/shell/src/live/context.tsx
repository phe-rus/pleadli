import { useLocation } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Context, type Dispatch, type FC, type PropsWithChildren, type SetStateAction } from 'react'
import {
  closeTab as closeTabIn,
  moveTab as moveTabIn,
  openTab as openTabIn,
  parseWorkspace,
  renameTab as renameTabIn,
  serializeWorkspace,
  setExtra as setExtraIn,
  setLeftOpen as setLeftOpenIn,
  setRight,
  toggleSection as toggleSectionIn,
  togglePinned as togglePinnedIn,
  type RecentItem,
  type Rules,
  type WorkspaceState,
  type WorkspaceTab,
} from '../model'
import type { Location, ShellConfig } from '../types'

export type WorkspaceContextValue = {
  config: ShellConfig
  rules: Rules
  tabs: readonly WorkspaceTab[]
  recents: readonly RecentItem[]
  /** The tab the current location is open as, derived from the URL, never stored. */
  activeKey: string | null
  sections: Readonly<Record<string, boolean>>
  toggleSection: (id: string) => void
  openTab: (tab: WorkspaceTab) => void
  renameTab: (key: string, title: string, subtitle?: string) => void
  closeTab: (key: string) => void
  moveTab: (fromKey: string, toKey: string) => void
  togglePinned: (key: string) => void
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  quickAddOpen: boolean
  setQuickAddOpen: Dispatch<SetStateAction<boolean>>
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  rightOpen: boolean
  setRightOpen: (open: boolean) => void
  rightWidth: number
  setRightWidth: (width: number) => void
  rightLocked: boolean
  toggleRightLocked: () => void
  /** The app's own saved top level fields (`persistedExtras`). */
  extras: Readonly<Record<string, unknown>>
  setExtra: (name: string, value: unknown) => void
}

/** One context object for the whole page, kept on `globalThis`. In development
 * a hot update can load this module a second time, and a provider from one copy
 * would then not reach a consumer from the other. Both copies share this one. */
const CONTEXT_KEY = Symbol.for('pleadli.shell.workspace-context')
const shared = globalThis as unknown as Record<symbol, Context<WorkspaceContextValue | null> | undefined>
const WorkspaceContext = (shared[CONTEXT_KEY] ??= createContext<WorkspaceContextValue | null>(null))

/** Inside the shell. Calling it anywhere else is a mistake in the app. */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace was called outside WorkspaceShell.')
  return ctx
}

export const useShellConfig = () => useWorkspace().config
export const useLabels = () => useWorkspace().config.labels()

export function useLocationParts(): Location {
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> })
  return { pathname, search }
}

const searchOf = (query: string) => Object.fromEntries(new URLSearchParams(query)) as Record<string, unknown>

/** The workspace a person has open: tabs, pinned tabs, recent history, which
 * sidebar sections are folded, and the right panel. What is open is a route (the
 * URL is the source of truth), so the active tab is derived from the location.
 * Saved on this machine under the key the app passes. */
export const WorkspaceProvider: FC<PropsWithChildren<{ config: ShellConfig; storageKey: string }>> = ({ config, storageKey, children }) => {
  const { pathname, search } = useLocationParts()
  const rules = useMemo<Rules>(() => ({ maxRecents: config.maxRecents, rightTemporary: config.rightPanelTemporary, home: { key: config.home.key, kind: config.home.kind, to: config.home.to, title: config.home.title(), pinned: true } }), [config])
  const [state, setState] = useState<WorkspaceState>(() =>
    parseWorkspace(readSaved(storageKey), rules, {
      resolves: (to, key) => config.identity.resolve({ pathname: to.split('?')[0], search: searchOf(to.split('?')[1] ?? '') })?.key === key,
      extras: config.persistedExtras,
    }),
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, serializeWorkspace(state))
    } catch {
      // The workspace simply is not remembered; it still works.
    }
  }, [state, storageKey])

  const activeKey = config.identity.resolve({ pathname, search })?.key ?? null

  const update = useCallback((fn: (prev: WorkspaceState) => WorkspaceState) => setState(fn), [])
  const setLeftOpen: Dispatch<SetStateAction<boolean>> = useCallback((next) => update((prev) => setLeftOpenIn(prev, typeof next === 'function' ? next(prev.leftOpen) : next)), [update])
  const openTab = useCallback((tab: WorkspaceTab) => update((prev) => openTabIn(prev, tab, rules)), [update, rules])
  const renameTab = useCallback((key: string, title: string, subtitle?: string) => update((prev) => renameTabIn(prev, key, title, subtitle)), [update])
  const closeTab = useCallback((key: string) => update((prev) => closeTabIn(prev, key, rules)), [update, rules])
  const moveTab = useCallback((from: string, to: string) => update((prev) => moveTabIn(prev, from, to)), [update])
  const togglePinned = useCallback((key: string) => update((prev) => togglePinnedIn(prev, key, rules)), [update, rules])
  const toggleSection = useCallback((id: string) => update((prev) => toggleSectionIn(prev, id)), [update])
  const setRightOpen = useCallback((open: boolean) => update((prev) => setRight(prev, { rightOpen: open })), [update])
  const setRightWidth = useCallback((width: number) => update((prev) => setRight(prev, { rightWidth: width })), [update])
  const toggleRightLocked = useCallback(() => update((prev) => setRight(prev, { rightLocked: !prev.rightLocked })), [update])
  const setExtra = useCallback((name: string, value: unknown) => update((prev) => setExtraIn(prev, name, value)), [update])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      config,
      rules,
      tabs: state.tabs,
      recents: state.recents,
      activeKey,
      sections: state.sections,
      toggleSection,
      openTab,
      renameTab,
      closeTab,
      moveTab,
      togglePinned,
      searchOpen,
      setSearchOpen,
      quickAddOpen,
      setQuickAddOpen,
      leftOpen: state.leftOpen,
      setLeftOpen,
      rightOpen: state.rightOpen,
      setRightOpen,
      rightWidth: state.rightWidth,
      setRightWidth,
      rightLocked: state.rightLocked,
      toggleRightLocked,
      extras: state.extras,
      setExtra,
    }),
    [config, rules, state, activeKey, searchOpen, quickAddOpen, toggleSection, openTab, renameTab, closeTab, moveTab, togglePinned, setLeftOpen, setRightOpen, setRightWidth, toggleRightLocked, setExtra],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function readSaved(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}
