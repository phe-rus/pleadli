import { clampRight, MAX_RECENTS, MAX_TABS, RIGHT_DEFAULT, type Rules, type WorkspaceState, type WorkspaceTab } from './types'

export const initialState = (rules: Rules): WorkspaceState => ({
  tabs: [rules.home],
  recents: [],
  leftOpen: true,
  sections: {},
  rightOpen: false,
  rightWidth: RIGHT_DEFAULT,
  rightLocked: false,
  extras: {},
})

const isTab = (value: unknown): value is WorkspaceTab => {
  const tab = value as WorkspaceTab
  return typeof tab?.key === 'string' && typeof tab.title === 'string' && typeof tab.to === 'string' && typeof tab.kind === 'string'
}

export type LoadOptions = {
  /** Whether a saved location still opens as the tab it was saved as. */
  resolves: (to: string, key: string) => boolean
  /** Names of the app's own top level fields to keep. */
  extras?: readonly string[]
}

/** Reads a saved workspace. Nothing in it is trusted: a tab whose location no
 * longer resolves is dropped, the home tab is always first and pinned, and a
 * saved right panel width is kept inside its limits. */
export function parseWorkspace(raw: string | null, rules: Rules, options: LoadOptions): WorkspaceState {
  const initial = initialState(rules)
  let parsed: Record<string, unknown> | null
  try {
    parsed = JSON.parse(raw ?? 'null') as Record<string, unknown> | null
  } catch {
    return initial
  }
  if (!parsed || typeof parsed !== 'object') return initial

  const savedTabs = (Array.isArray(parsed.tabs) ? parsed.tabs : []).filter(isTab).filter((tab) => tab.key !== rules.home.key && options.resolves(tab.to, tab.key))
  const savedRecents = (Array.isArray(parsed.recents) ? parsed.recents : []) as WorkspaceState['recents']
  const sections: Record<string, boolean> = {}
  if (parsed.sections && typeof parsed.sections === 'object') {
    for (const [id, open] of Object.entries(parsed.sections)) if (typeof open === 'boolean') sections[id] = open
  }
  const extras: Record<string, unknown> = {}
  for (const name of options.extras ?? []) if (name in parsed) extras[name] = parsed[name]

  const rightLocked = typeof parsed.rightLocked === 'boolean' ? parsed.rightLocked : initial.rightLocked
  const rightOpen = typeof parsed.rightOpen === 'boolean' ? parsed.rightOpen : initial.rightOpen
  return {
    tabs: [rules.home, ...savedTabs].slice(0, MAX_TABS),
    recents: savedRecents.filter((r) => typeof r?.key === 'string' && typeof r.to === 'string' && options.resolves(r.to, r.key)).slice(0, rules.maxRecents ?? MAX_RECENTS),
    leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : initial.leftOpen,
    sections,
    rightOpen: rules.rightTemporary ? rightLocked && rightOpen : rightOpen,
    rightWidth: typeof parsed.rightWidth === 'number' ? clampRight(parsed.rightWidth) : initial.rightWidth,
    rightLocked,
    extras,
  }
}

/** What is written back: the same top level shape that is read. */
export function serializeWorkspace(state: WorkspaceState): string {
  const { extras, ...own } = state
  return JSON.stringify({ ...extras, ...own })
}
