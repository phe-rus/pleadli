/** One open tab. `kind` is the app's own word for what it is (an area, a case,
 * a prisoner); the shell only cares whether it is the home tab. */
export type WorkspaceTab = {
  key: string
  kind: string
  title: string
  /** A short second line, such as a prisoner number. */
  subtitle?: string
  to: string
  pinned?: boolean
  lastActiveAt?: number
}

export type RecentItem = { key: string; kind: string; title: string; subtitle?: string; to: string }

/** The right panel's width limits, in pixels. */
export const RIGHT_MIN = 320
export const RIGHT_DEFAULT = 384
export const RIGHT_MAX = 720

/** At most this many tabs are open, the home tab included. Opening one more
 * replaces the tab worked on longest ago. */
export const MAX_TABS = 5
/** The Recent list never holds more than this. */
export const MAX_RECENTS = 3

/** What an app saves on this machine. `extras` holds the few top level fields
 * an app keeps for itself (Prisons: `sidebarView`, `rightMode`, `areasTouched`);
 * they are written at the top level of the saved object, under their own names. */
export type WorkspaceState = {
  tabs: WorkspaceTab[]
  recents: RecentItem[]
  leftOpen: boolean
  /** true = open. An id never seen counts as open. */
  sections: Record<string, boolean>
  rightOpen: boolean
  rightWidth: number
  rightLocked: boolean
  extras: Record<string, unknown>
}

/** What the model needs to know about an app. */
export type Rules = {
  /** How many recent items to keep. The shell default is 3; an app that has a page for them says how many. */
  maxRecents?: number
  /** A side panel that is not locked starts closed and folds away when the person moves to another place. */
  rightTemporary?: boolean
  /** Tabs the app does not draw are not kept as tabs, so they never use up the open limit; they still go to Recent. */
  drawn?: (tab: { key: string; kind: string }) => boolean
  /** How many tabs may be open (default 5). */
  maxTabs?: number
  /** The first tab, always pinned and fixed (Today). */
  home: WorkspaceTab
}

export const clampRight = (width: number) => Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, Math.round(width)))

export const isHome = (rules: Rules, tab: { key: string }) => tab.key === rules.home.key
