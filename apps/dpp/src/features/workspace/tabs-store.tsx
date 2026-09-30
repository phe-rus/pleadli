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
import { identityForLocation } from './tab-identity'

export type TabKind = 'overview' | 'area' | 'file' | 'document'
export type WorkspaceTab = {
  key: string
  kind: TabKind
  title: string
  to: string
  pinned?: boolean
  lastActiveAt?: number
}
export type RecentItem = { key: string; kind: TabKind; title: string; to: string }
export type SectionId = 'pinned' | 'recent' | 'files' | 'work' | 'office' | 'more'

/** At most this many tabs are open, Overview included. Opening one more
 * replaces the tab worked on longest ago. */
const MAX_TABS = 5
/** The sidebar's Recent list never shows more than this. */
export const MAX_RECENTS = 3

/** `title` stays empty: Overview's name is display text, derived at render
 * time by `tabTitle` so it follows the current language. */
const OVERVIEW_TAB: WorkspaceTab = { key: 'overview', kind: 'overview', title: '', to: '/', pinned: true }

type Persisted = {
  tabs: WorkspaceTab[]
  recents: RecentItem[]
  leftOpen: boolean
  /** true = expanded */
  sections: Record<SectionId, boolean>
}

const INITIAL: Persisted = {
  tabs: [OVERVIEW_TAB],
  recents: [],
  leftOpen: true,
  sections: { pinned: true, recent: true, files: true, work: true, office: true, more: false },
}

const isTab = (value: unknown): value is WorkspaceTab => {
  const tab = value as WorkspaceTab
  return typeof tab?.key === 'string' && typeof tab.title === 'string' && typeof tab.to === 'string' && typeof tab.kind === 'string'
}

const locationOf = (to: string) => {
  const [pathname, query = ''] = to.split('?')
  return { pathname, search: Object.fromEntries(new URLSearchParams(query)) }
}

const resolves = (to: string, key: string) => {
  const { pathname, search } = locationOf(to)
  return identityForLocation(pathname, search)?.key === key
}

/** Reads the saved workspace. Nothing here is trusted: a saved tab whose
 * location no longer resolves to that tab is dropped, and Overview is always
 * the first, pinned tab. */
function load(storageKey: string): Persisted {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Persisted> | null
    if (!parsed) return INITIAL
    const tabs = (Array.isArray(parsed.tabs) ? parsed.tabs : []).filter(isTab).filter((tab) => tab.key !== 'overview' && resolves(tab.to, tab.key))
    return {
      tabs: [OVERVIEW_TAB, ...tabs].slice(0, MAX_TABS),
      recents: (Array.isArray(parsed.recents) ? parsed.recents : []).filter((r) => typeof r?.key === 'string' && typeof r.to === 'string' && resolves(r.to, r.key)).slice(0, MAX_RECENTS),
      leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : INITIAL.leftOpen,
      sections: { ...INITIAL.sections, ...parsed.sections },
    }
  } catch {
    return INITIAL
  }
}

type WorkspaceContextValue = {
  tabs: readonly WorkspaceTab[]
  recents: readonly RecentItem[]
  /** The tab the current location is open as, derived from the URL. */
  activeKey: string | null
  sections: Readonly<Record<SectionId, boolean>>
  toggleSection: (id: SectionId) => void
  openTab: (tab: WorkspaceTab) => void
  renameTab: (key: string, title: string) => void
  closeTab: (key: string) => void
  moveTab: (fromKey: string, toKey: string) => void
  togglePinned: (key: string) => void
  commandOpen: boolean
  setCommandOpen: Dispatch<SetStateAction<boolean>>
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
}

/** One context object for the whole page, kept on `globalThis`. In development
 * a hot update can load this module a second time, and a provider from one copy
 * would then not reach a consumer from the other. Both copies share this one
 * object instead. */
const CONTEXT_KEY = Symbol.for('pleadli.dpp.workspace-context')
const shared = globalThis as unknown as Record<symbol, Context<WorkspaceContextValue | null> | undefined>
const WorkspaceContext = (shared[CONTEXT_KEY] ??= createContext<WorkspaceContextValue | null>(null))

const noop = () => {}
const OUTSIDE: WorkspaceContextValue = {
  tabs: [],
  recents: [],
  activeKey: null,
  sections: INITIAL.sections,
  toggleSection: noop,
  openTab: noop,
  renameTab: noop,
  closeTab: noop,
  moveTab: noop,
  togglePinned: noop,
  commandOpen: false,
  setCommandOpen: noop,
  leftOpen: false,
  setLeftOpen: noop,
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

const recentOf = (tab: WorkspaceTab): RecentItem => ({ key: tab.key, kind: tab.kind, title: tab.title, to: tab.to })

/** The workspace the prosecutor has open: tabs, pinned tabs, recent history and
 * which sidebar sections are folded. What is open is a route (the URL is the
 * source of truth), so the active tab is derived from the location and never
 * stored. Saved on this machine. */
export const WorkspaceProvider: FC<PropsWithChildren<{ storageKey: string }>> = ({ storageKey, children }) => {
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> })
  const [state, setState] = useState<Persisted>(() => load(storageKey))
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // The workspace simply is not remembered; it still works.
    }
  }, [state, storageKey])

  const activeKey = identityForLocation(pathname, search)?.key ?? null

  const setLeftOpen: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    setState((prev) => ({ ...prev, leftOpen: typeof next === 'function' ? next(prev.leftOpen) : next }))
  }, [])

  const openTab = useCallback((tab: WorkspaceTab) => {
    setState((prev) => {
      const now = Date.now()
      const exists = prev.tabs.some((t) => t.key === tab.key)
      let tabs = exists
        ? prev.tabs.map((t) => (t.key === tab.key ? { ...t, to: tab.to, lastActiveAt: now, ...(t.kind === 'file' || t.kind === 'document' ? {} : { title: tab.title }) } : t))
        : [...prev.tabs, { ...tab, lastActiveAt: now }]
      if (tabs.length > MAX_TABS) {
        // Make room by replacing the tab worked on least recently: never
        // Overview and never the one being opened. A pinned tab is only
        // replaced when every other tab is pinned too.
        const candidates = tabs.filter((t) => t.kind !== 'overview' && t.key !== tab.key)
        const oldest = (list: WorkspaceTab[]) => [...list].sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0))[0]
        const evict = oldest(candidates.filter((t) => !t.pinned)) ?? oldest(candidates)
        if (evict) tabs = tabs.filter((t) => t.key !== evict.key)
      }
      const opened = tabs.find((t) => t.key === tab.key)!
      return { ...prev, tabs, recents: [recentOf(opened), ...prev.recents.filter((r) => r.key !== tab.key)].slice(0, MAX_RECENTS) }
    })
  }, [])

  const renameTab = useCallback((key: string, title: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.key === key)
      if (!tab || tab.title === title) return prev
      return {
        ...prev,
        tabs: prev.tabs.map((t) => (t.key === key ? { ...t, title } : t)),
        recents: prev.recents.map((r) => (r.key === key ? { ...r, title } : r)),
      }
    })
  }, [])

  const closeTab = useCallback((key: string) => {
    setState((prev) => ({ ...prev, tabs: prev.tabs.filter((t) => t.key !== key || t.kind === 'overview' || t.pinned) }))
  }, [])

  const moveTab = useCallback((fromKey: string, toKey: string) => {
    setState((prev) => {
      const from = prev.tabs.findIndex((t) => t.key === fromKey)
      const to = prev.tabs.findIndex((t) => t.key === toKey)
      // Overview keeps the first place.
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
      if (!tab || tab.kind === 'overview') return prev
      const rest = prev.tabs.filter((t) => t.key !== key)
      const pinned = !tab.pinned
      const firstUnpinned = rest.findIndex((t) => !t.pinned)
      rest.splice(firstUnpinned === -1 ? rest.length : firstUnpinned, 0, { ...tab, pinned })
      return { ...prev, tabs: rest }
    })
  }, [])

  const toggleSection = useCallback((id: SectionId) => {
    setState((prev) => ({ ...prev, sections: { ...prev.sections, [id]: !prev.sections[id] } }))
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
      leftOpen: state.leftOpen,
      setLeftOpen,
    }),
    [state, activeKey, commandOpen, toggleSection, openTab, renameTab, closeTab, moveTab, togglePinned, setLeftOpen],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
