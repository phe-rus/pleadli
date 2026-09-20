import { useLocation } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type Dispatch,
  type FC,
  type PropsWithChildren,
  type SetStateAction,
} from 'react'
import { identityForPath } from './tab-identity'
import { m } from '@/paraglide/messages'

export type TabKind = 'today' | 'area' | 'prisoner' | 'procedure' | 'document' | 'report'
export type WorkspaceTab = {
  key: string
  kind: TabKind
  title: string
  /** A short secondary label, such as a prisoner number. */
  subtitle?: string
  to: string
  pinned?: boolean
  lastActiveAt?: number
}
export type RecentItem = { key: string; kind: TabKind; title: string; subtitle?: string; to: string }
export type SectionId = 'pinned' | 'recent' | 'areas'
/** What the sidebar shows: the workspace (pinned, open, recent, areas) or the
 * inbox as a list of messages. */
export type SidebarView = 'workspace' | 'inbox'
/** What the right pillar shows: the assistant anywhere, or the open record's
 * context when a prisoner's file is in view. */
export type RightMode = 'assistant' | 'record'

/** The right pillar's width in pixels: it opens a little wider than the old
 * context column, grows to `RIGHT_WIDE` with one click, and can be dragged
 * anywhere between the two limits. */
export const RIGHT_MIN = 320
export const RIGHT_DEFAULT = 384
export const RIGHT_WIDE = 576
export const RIGHT_MAX = 720
const clampRight = (width: number) => Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, Math.round(width)))

/** At most this many tabs are open, Today included. Opening one more replaces
 * the tab worked on longest ago. */
const MAX_TABS = 5
/** The sidebar's Recent list never shows more than this. */
export const MAX_RECENTS = 3
/** With this many tabs open the officer has found their way around, so the
 * Areas list folds away unless they have already decided for themselves. */
const AREAS_FOLD_AT = 4

const TODAY_TAB: WorkspaceTab = { key: 'today', kind: 'today', get title() { return m.workspace_today() }, to: '/', pinned: true }

type Persisted = {
  tabs: WorkspaceTab[]
  recents: RecentItem[]
  leftOpen: boolean
  sidebarView: SidebarView
  /** true = expanded */
  sections: Record<SectionId, boolean>
  areasTouched: boolean
  /** Only honoured on load while locked: an unlocked pillar starts closed. */
  rightOpen: boolean
  rightMode: RightMode
  rightWidth: number
  /** A locked pillar stays open from tab to tab and across restarts; an
   * unlocked one folds away when the officer moves to another tab. */
  rightLocked: boolean
}

const INITIAL: Persisted = {
  tabs: [TODAY_TAB],
  recents: [],
  leftOpen: true,
  sidebarView: 'workspace',
  sections: { pinned: true, recent: true, areas: true },
  areasTouched: false,
  rightOpen: false,
  rightMode: 'assistant',
  rightWidth: RIGHT_DEFAULT,
  rightLocked: false,
}

const isTab = (value: unknown): value is WorkspaceTab => {
  const tab = value as WorkspaceTab
  return typeof tab?.key === 'string' && typeof tab.title === 'string' && typeof tab.to === 'string' && typeof tab.kind === 'string'
}

/** Reads the officer's saved workspace. Nothing here is trusted: a saved tab
 * whose path no longer resolves to a tab is dropped, and Today is always the
 * first, pinned tab. */
function load(storageKey: string): Persisted {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Persisted> | null
    if (!parsed) return INITIAL
    const tabs = (Array.isArray(parsed.tabs) ? parsed.tabs : []).filter(isTab).filter((tab) => tab.key !== 'today' && identityForPath(tab.to)?.key === tab.key)
    return {
      tabs: [TODAY_TAB, ...tabs].slice(0, MAX_TABS),
      recents: (Array.isArray(parsed.recents) ? parsed.recents : []).filter((r) => typeof r?.key === 'string' && typeof r.to === 'string' && identityForPath(r.to)).slice(0, MAX_RECENTS),
      leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : INITIAL.leftOpen,
      sidebarView: parsed.sidebarView === 'inbox' ? 'inbox' : 'workspace',
      sections: { ...INITIAL.sections, ...parsed.sections },
      areasTouched: parsed.areasTouched === true,
      rightLocked: parsed.rightLocked === true,
      rightOpen: parsed.rightLocked === true && parsed.rightOpen === true,
      rightMode: parsed.rightMode === 'record' ? 'record' : 'assistant',
      rightWidth: typeof parsed.rightWidth === 'number' ? clampRight(parsed.rightWidth) : RIGHT_DEFAULT,
    }
  } catch {
    return INITIAL
  }
}

type WorkspaceContextValue = {
  tabs: readonly WorkspaceTab[]
  recents: readonly RecentItem[]
  /** The tab the current route is open as, derived from the URL. */
  activeKey: string | null
  sections: Readonly<Record<SectionId, boolean>>
  toggleSection: (id: SectionId) => void
  openTab: (tab: WorkspaceTab) => void
  renameTab: (key: string, title: string, subtitle?: string) => void
  closeTab: (key: string) => void
  moveTab: (fromKey: string, toKey: string) => void
  togglePinned: (key: string) => void
  commandOpen: boolean
  setCommandOpen: Dispatch<SetStateAction<boolean>>
  /** The right pillar: whether it is showing, what, how wide, and whether it
   * is locked open. */
  rightOpen: boolean
  setRightOpen: Dispatch<SetStateAction<boolean>>
  rightMode: RightMode
  /** Opens the pillar on `mode`, or folds it if it is already showing that. */
  toggleRight: (mode: RightMode) => void
  setRightMode: (mode: RightMode) => void
  rightWidth: number
  setRightWidth: (width: number) => void
  rightLocked: boolean
  toggleRightLocked: () => void
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  sidebarView: SidebarView
  setSidebarView: (view: SidebarView) => void
}

/** One context object for the whole page, kept on `globalThis`. In development
 * a hot update can load this module a second time, and a provider from one copy
 * would then not reach a consumer from the other ("useWorkspace must be used
 * within WorkspaceProvider"). Both copies share this one object instead. */
const CONTEXT_KEY = Symbol.for('pleadli.prisons.workspace-context')
const shared = globalThis as unknown as Record<symbol, Context<WorkspaceContextValue | null> | undefined>
const WorkspaceContext = (shared[CONTEXT_KEY] ??= createContext<WorkspaceContextValue | null>(null))

const noop = () => {}
/** What a component outside the provider gets: nothing open, nothing to do. A
 * missing provider is a bug to log, never a reason to take the screen down and
 * retry it in a loop. */
const OUTSIDE: WorkspaceContextValue = {
  tabs: [],
  recents: [],
  activeKey: null,
  sections: { pinned: true, recent: true, areas: true },
  toggleSection: noop,
  openTab: noop,
  renameTab: noop,
  closeTab: noop,
  moveTab: noop,
  togglePinned: noop,
  commandOpen: false,
  setCommandOpen: noop,
  rightOpen: false,
  setRightOpen: noop,
  rightMode: 'assistant',
  toggleRight: noop,
  setRightMode: noop,
  rightWidth: RIGHT_DEFAULT,
  setRightWidth: noop,
  rightLocked: false,
  toggleRightLocked: noop,
  leftOpen: false,
  setLeftOpen: noop,
  sidebarView: 'workspace',
  setSidebarView: noop,
}
let warned = false

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (ctx) return ctx
  if (!warned) {
    warned = true
    console.warn('useWorkspace was called outside WorkspaceProvider; using an empty workspace.', new Error().stack)
  }
  return OUTSIDE
}

const recentOf = (tab: WorkspaceTab): RecentItem => ({ key: tab.key, kind: tab.kind, title: tab.title, subtitle: tab.subtitle, to: tab.to })

/** The workspace an officer has open: tabs, pinned tabs, recent history and
 * which sidebar sections are folded. What is open is a route (the URL is the
 * source of truth), so the active tab is derived from the location, never
 * stored. Saved on this machine under the officer's own key, so a shared
 * computer never shows one officer's open files to the next. */
export const WorkspaceProvider: FC<PropsWithChildren<{ storageKey: string }>> = ({ storageKey, children }) => {
  const pathname = useLocation({ select: (location) => location.pathname })
  const [state, setState] = useState<Persisted>(() => load(storageKey))
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // The workspace simply is not remembered; it still works.
    }
  }, [state, storageKey])

  const activeKey = identityForPath(pathname)?.key ?? null

  const setLeftOpen: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    setState((prev) => ({ ...prev, leftOpen: typeof next === 'function' ? next(prev.leftOpen) : next }))
  }, [])

  const setRightOpen: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    setState((prev) => {
      const rightOpen = typeof next === 'function' ? next(prev.rightOpen) : next
      return rightOpen === prev.rightOpen ? prev : { ...prev, rightOpen }
    })
  }, [])

  const toggleRight = useCallback((mode: RightMode) => {
    setState((prev) => (prev.rightOpen && prev.rightMode === mode ? { ...prev, rightOpen: false } : { ...prev, rightOpen: true, rightMode: mode }))
  }, [])

  const setRightMode = useCallback((rightMode: RightMode) => {
    setState((prev) => (prev.rightMode === rightMode ? prev : { ...prev, rightMode }))
  }, [])

  const setRightWidth = useCallback((width: number) => {
    setState((prev) => (prev.rightWidth === clampRight(width) ? prev : { ...prev, rightWidth: clampRight(width) }))
  }, [])

  const toggleRightLocked = useCallback(() => {
    setState((prev) => ({ ...prev, rightLocked: !prev.rightLocked }))
  }, [])

  const setSidebarView = useCallback((view: SidebarView) => {
    setState((prev) => (prev.sidebarView === view ? prev : { ...prev, sidebarView: view }))
  }, [])

  const openTab = useCallback((tab: WorkspaceTab) => {
    setState((prev) => {
      const now = Date.now()
      const exists = prev.tabs.some((t) => t.key === tab.key)
      let tabs = exists
        ? prev.tabs.map((t) => (t.key === tab.key ? { ...t, to: tab.to, lastActiveAt: now, ...(t.kind === 'prisoner' || t.kind === 'document' || t.kind === 'report' ? {} : { title: tab.title }) } : t))
        : [...prev.tabs, { ...tab, lastActiveAt: now }]
      if (tabs.length > MAX_TABS) {
        // Make room by replacing the tab worked on least recently: never Today
        // and never the one being opened. A pinned tab is only replaced when
        // every other tab is pinned too, so a full strip still opens the page.
        const candidates = tabs.filter((t) => t.kind !== 'today' && t.key !== tab.key)
        const oldest = (list: WorkspaceTab[]) => [...list].sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0))[0]
        const evict = oldest(candidates.filter((t) => !t.pinned)) ?? oldest(candidates)
        if (evict) tabs = tabs.filter((t) => t.key !== evict.key)
      }
      const opened = tabs.find((t) => t.key === tab.key)!
      const fold = !exists && !prev.areasTouched && tabs.length >= AREAS_FOLD_AT
      return {
        ...prev,
        tabs,
        recents: [recentOf(opened), ...prev.recents.filter((r) => r.key !== tab.key)].slice(0, MAX_RECENTS),
        sections: fold ? { ...prev.sections, areas: false } : prev.sections,
      }
    })
  }, [])

  const renameTab = useCallback((key: string, title: string, subtitle?: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.key === key)
      if (!tab || (tab.title === title && tab.subtitle === subtitle)) return prev
      return {
        ...prev,
        tabs: prev.tabs.map((t) => (t.key === key ? { ...t, title, subtitle } : t)),
        recents: prev.recents.map((r) => (r.key === key ? { ...r, title, subtitle } : r)),
      }
    })
  }, [])

  const closeTab = useCallback((key: string) => {
    setState((prev) => ({ ...prev, tabs: prev.tabs.filter((t) => t.key !== key || t.kind === 'today' || t.pinned) }))
  }, [])

  const moveTab = useCallback((fromKey: string, toKey: string) => {
    setState((prev) => {
      const from = prev.tabs.findIndex((t) => t.key === fromKey)
      const to = prev.tabs.findIndex((t) => t.key === toKey)
      // Today keeps the first place.
      if (from < 1 || to < 1 || from === to) return prev
      const tabs = [...prev.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { ...prev, tabs }
    })
  }, [])

  const togglePinned = useCallback((key: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.key === key)
      if (!tab || tab.kind === 'today') return prev
      const rest = prev.tabs.filter((t) => t.key !== key)
      const pinned = !tab.pinned
      // A pinned tab moves in behind the other pinned tabs; an unpinned one
      // returns just after them.
      const firstUnpinned = rest.findIndex((t) => !t.pinned)
      const at = firstUnpinned === -1 ? rest.length : firstUnpinned
      rest.splice(at, 0, { ...tab, pinned })
      return { ...prev, tabs: rest }
    })
  }, [])

  const toggleSection = useCallback((id: SectionId) => {
    setState((prev) => ({
      ...prev,
      sections: { ...prev.sections, [id]: !prev.sections[id] },
      areasTouched: prev.areasTouched || id === 'areas',
    }))
  }, [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
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
      commandOpen,
      setCommandOpen,
      rightOpen: state.rightOpen,
      setRightOpen,
      rightMode: state.rightMode,
      toggleRight,
      setRightMode,
      rightWidth: state.rightWidth,
      setRightWidth,
      rightLocked: state.rightLocked,
      toggleRightLocked,
      leftOpen: state.leftOpen,
      setLeftOpen,
      sidebarView: state.sidebarView,
      setSidebarView,
    }),
    [state, activeKey, commandOpen, toggleSection, openTab, renameTab, closeTab, moveTab, togglePinned, setLeftOpen, setSidebarView, setRightOpen, toggleRight, setRightMode, setRightWidth, toggleRightLocked],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
