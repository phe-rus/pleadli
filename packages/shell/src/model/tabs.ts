import { clampRight, isHome, MAX_RECENTS, MAX_TABS, type RecentItem, type Rules, type WorkspaceState, type WorkspaceTab } from './types'

const recentOf = (tab: WorkspaceTab): RecentItem => ({ key: tab.key, kind: tab.kind, title: tab.title, ...(tab.subtitle ? { subtitle: tab.subtitle } : {}), to: tab.to })

/** An area (and the home tab) is named in the current language each time it is
 * drawn, so reopening it refreshes its saved title; a record keeps its own. */
const refreshesTitle = (rules: Rules, tab: WorkspaceTab) => tab.kind === 'area' || isHome(rules, tab)

/** Opens a tab, or focuses it when it is already open. A sixth tab replaces the
 * one worked on longest ago: never the home tab, never the one being opened.
 * A pinned tab is only replaced when every other tab is pinned too. */
export function openTab(state: WorkspaceState, tab: WorkspaceTab, rules: Rules, now = Date.now()): WorkspaceState {
  const exists = state.tabs.some((t) => t.key === tab.key)
  let tabs = exists
    ? state.tabs.map((t) => (t.key === tab.key ? { ...t, to: tab.to, lastActiveAt: now, ...(refreshesTitle(rules, t) ? { title: tab.title } : {}) } : t))
    : [...state.tabs, { ...tab, lastActiveAt: now }]
  if (tabs.length > MAX_TABS) {
    const candidates = tabs.filter((t) => !isHome(rules, t) && t.key !== tab.key)
    const oldest = (list: WorkspaceTab[]) => [...list].sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0))[0]
    const evict = oldest(candidates.filter((t) => !t.pinned)) ?? oldest(candidates)
    if (evict) tabs = tabs.filter((t) => t.key !== evict.key)
  }
  const opened = tabs.find((t) => t.key === tab.key)
  if (!opened) return state
  return {
    ...state,
    tabs,
    recents: [recentOf(opened), ...state.recents.filter((r) => r.key !== tab.key)].slice(0, rules.maxRecents ?? MAX_RECENTS),
  }
}

/** Gives a record's tab its own name once the record has loaded. */
export function renameTab(state: WorkspaceState, key: string, title: string, subtitle?: string): WorkspaceState {
  const tab = state.tabs.find((t) => t.key === key)
  if (!tab || (tab.title === title && tab.subtitle === subtitle)) return state
  const apply = <T extends { key: string; title: string; subtitle?: string }>(item: T): T => (item.key === key ? { ...item, title, subtitle } : item)
  return { ...state, tabs: state.tabs.map(apply), recents: state.recents.map(apply) }
}

/** A pinned tab and the home tab ignore this. */
export function closeTab(state: WorkspaceState, key: string, rules: Rules): WorkspaceState {
  const tab = state.tabs.find((t) => t.key === key)
  if (!tab || isHome(rules, tab) || tab.pinned) return state
  return { ...state, tabs: state.tabs.filter((t) => t.key !== key) }
}

/** Moves one tab to where another is. Nothing ever goes ahead of the home tab. */
export function moveTab(state: WorkspaceState, fromKey: string, toKey: string): WorkspaceState {
  const from = state.tabs.findIndex((t) => t.key === fromKey)
  const to = state.tabs.findIndex((t) => t.key === toKey)
  if (from < 1 || to < 1 || from === to) return state
  const tabs = [...state.tabs]
  const [moved] = tabs.splice(from, 1)
  tabs.splice(to, 0, moved)
  return { ...state, tabs }
}

/** Pins or unpins a tab; pinned tabs sit together before the others. */
export function togglePinned(state: WorkspaceState, key: string, rules: Rules): WorkspaceState {
  const tab = state.tabs.find((t) => t.key === key)
  if (!tab || isHome(rules, tab)) return state
  const rest = state.tabs.filter((t) => t.key !== key)
  const firstUnpinned = rest.findIndex((t) => !t.pinned)
  rest.splice(firstUnpinned === -1 ? rest.length : firstUnpinned, 0, { ...tab, pinned: !tab.pinned })
  return { ...state, tabs: rest }
}

export const toggleSection = (state: WorkspaceState, id: string): WorkspaceState => ({
  ...state,
  sections: { ...state.sections, [id]: !(state.sections[id] ?? true) },
})

export const setLeftOpen = (state: WorkspaceState, open: boolean): WorkspaceState => (state.leftOpen === open ? state : { ...state, leftOpen: open })

export const setRight = (state: WorkspaceState, patch: Partial<Pick<WorkspaceState, 'rightOpen' | 'rightWidth' | 'rightLocked'>>): WorkspaceState => ({
  ...state,
  ...patch,
  ...(patch.rightWidth !== undefined ? { rightWidth: clampRight(patch.rightWidth) } : {}),
})

/** Sets one of the app's own saved fields. */
export const setExtra = (state: WorkspaceState, name: string, value: unknown): WorkspaceState =>
  state.extras[name] === value ? state : { ...state, extras: { ...state.extras, [name]: value } }
