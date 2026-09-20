import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FC,
  type PropsWithChildren,
  type ReactNode,
  type SetStateAction,
} from 'react'

export type TabKind = 'today' | 'prisoner' | 'procedure' | 'area'
export type WorkspaceTab = {
  key: string
  kind: TabKind
  title: string
  subtitle?: string
  to: string
  pinned?: boolean
  closable: boolean
}
export type RecentItem = { key: string; title: string; subtitle?: string; to: string }

const STORAGE_KEY = 'pleadli:prisons:workspace:v1'

type PersistedWorkspace = {
  tabs: WorkspaceTab[]
  recents: RecentItem[]
  leftOpen: boolean
}

function loadPersisted(state: PersistedWorkspace): PersistedWorkspace {
  if (typeof localStorage === 'undefined') return state
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return state
    const parsed = JSON.parse(raw) as PersistedWorkspace
    return {
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs : state.tabs,
      recents: Array.isArray(parsed.recents) ? parsed.recents : state.recents,
      leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : state.leftOpen,
    }
  } catch {
    return state
  }
}

type WorkspaceContextValue = {
  tabs: readonly WorkspaceTab[]
  recents: readonly RecentItem[]
  activeKey: string | null
  isOpen: (key: string) => boolean
  isActive: (key: string) => boolean
  isPinned: (key: string) => boolean
  togglePinned: (key: string) => void
  openTab: (tab: WorkspaceTab) => void
  openArea: (tab: WorkspaceTab) => void
  closeTab: (key: string) => void
  setActive: (key: string | null) => void
  currentContext: ReactNode
  setCurrentContext: (node: ReactNode) => void
  clearContext: () => void
  commandOpen: boolean
  setCommandOpen: Dispatch<SetStateAction<boolean>>
  contextOpen: boolean
  setContextOpen: Dispatch<SetStateAction<boolean>>
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

const MAX_TABS = 12
const MAX_RECENTS = 8

/** The workspace state shared by the navigator, the tab strip and the
 * context panel: open records, pinned records, and a lightly-treaded recent
 * history, persisted locally so an officer's working context survives a
 * restart (offline-first, nothing is shared with anyone). Area views are
 * destinations, not tabs: only records open tabs. */
export const WorkspaceProvider: FC<PropsWithChildren> = ({ children }) => {
  const [state, setState] = useState<PersistedWorkspace>(() =>
    loadPersisted({ tabs: [], recents: [], leftOpen: true }),
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [pinnedKeys, setPinnedKeys] = useState<string[]>(['today'])
  const [currentContext, setCurrentContext] = useState<ReactNode>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(true)
  const leftOpen = state.leftOpen
  const setLeftOpen: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    setState((prev) => ({ ...prev, leftOpen: typeof next === 'function' ? (next as (v: boolean) => boolean)(prev.leftOpen) : next }))
  }, [])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const openTab = useCallback((tab: WorkspaceTab) => {
    setState((prev) => {
      const exists = prev.tabs.some((t) => t.key === tab.key)
      const tabs = exists
        ? prev.tabs.map((t) => (t.key === tab.key ? { ...tab, pinned: t.pinned } : t))
        : [...prev.tabs, tab].slice(-MAX_TABS)
      const recents = [{ key: tab.key, title: tab.title, subtitle: tab.subtitle, to: tab.to }, ...prev.recents.filter((r) => r.key !== tab.key)].slice(0, MAX_RECENTS)
      return { ...prev, tabs, recents }
    })
    setActiveKey(tab.key)
  }, [])

  const openArea = useCallback((tab: WorkspaceTab) => {
    setState((prev) => {
      const recents = [{ key: tab.key, title: tab.title, subtitle: tab.subtitle, to: tab.to }, ...prev.recents.filter((r) => r.key !== tab.key)].slice(0, MAX_RECENTS)
      return { ...prev, recents }
    })
    setActiveKey(tab.key)
  }, [])

  const closeTab = useCallback((key: string) => {
    setState((prev) => ({ ...prev, tabs: prev.tabs.filter((t) => t.key !== key) }))
    setPinnedKeys((prev) => prev.filter((k) => k !== key))
    setActiveKey((current) => (current === key ? null : current))
  }, [])

  const togglePinned = useCallback((key: string) => {
    setPinnedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const setActive = useCallback((key: string | null) => setActiveKey(key), [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      tabs: state.tabs,
      recents: state.recents,
      activeKey,
      isOpen: (key) => state.tabs.some((t) => t.key === key),
      isActive: (key) => key === activeKey,
      isPinned: (key) => pinnedKeys.includes(key),
      togglePinned,
      openTab,
      openArea,
      closeTab,
      setActive,
      currentContext,
      setCurrentContext,
      clearContext: () => setCurrentContext(null),
      commandOpen,
      setCommandOpen,
      contextOpen,
      setContextOpen,
      leftOpen,
      setLeftOpen,
    }),
    [state, activeKey, pinnedKeys, currentContext, commandOpen, contextOpen, leftOpen, togglePinned, openTab, openArea, closeTab, setActive, setLeftOpen],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}