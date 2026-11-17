import type { IconSvgElement } from '@hugeicons/react'
import type { ComponentType, ReactNode } from 'react'

/** Every word the shell shows. The app builds this from its own translations;
 * every key is required, so a missing one fails the app's typecheck. */
export type ShellLabels = {
  sidebar: string
  places: string
  search: string
  quickAdd: string
  find: string
  start: string
  settings: string
  signOut: string
  loading: string
  openTabs: string
  window: string
  previousTab: string
  nextTab: string
  previousTabWith: (key: string) => string
  nextTabWith: (key: string) => string
  pin: string
  unpin: string
  pinTab: (title: string) => string
  unpinTab: (title: string) => string
  closeTab: (title: string) => string
  closeWith: (key: string) => string
  hideSidebar: string
  showSidebar: string
  controls: { group: string; close: string; minimize: string; maximize: string }
  rightPanel: { title: string; empty: string; open: string; close: string; lock: string; unlock: string; resize: string; widen: string; narrow: string }
  error: { title: string; body: string; retry: string }
  recordTabs: Record<'overview' | 'papers' | 'people' | 'history', { label: string; empty: string; action: string }>
}

export type TabIdentity = { key: string; kind: string; to: string; title: string; subtitle?: string }
export type Location = { pathname: string; search: Record<string, unknown> }

export type NavRow = {
  id: string
  to: string
  label: string
  icon: IconSvgElement
  /** Defaults to: the path is this row's path, or lies under it. */
  match?: (location: Location) => boolean
}
export type NavSection = {
  id: string
  /** A section with no label is a plain group of rows that does not fold. */
  label?: string
  rows: NavRow[]
}
export type NavModel = { today: NavRow; sections: NavSection[] }

export type QuickAddContext = { onDirtyChange: (dirty: boolean) => void; close: () => void }
export type QuickAddItem = {
  id: string
  label: string
  icon: IconSvgElement
  /** Picking the item runs this, for an item that goes somewhere instead of opening a form. */
  run?: () => void
  panel?: { title: string; description: string; render: (context: QuickAddContext) => ReactNode }
}
export type CreateFrameProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  dirty: boolean
  headings: { title: string; description: string }
  children: ReactNode
}

export type FooterModel = {
  person?: { name: string; sub: string; initials: string; to?: string; /** Replaces the initials circle. */ avatar?: ReactNode }
  languageSelect: ReactNode
  settingsTo: string
  onSignOut?: () => void
}

export type ShellSlots = {
  /** A bar under the header, such as a licence notice. */
  licenceBar?: ComponentType
  /** The thin bar along the foot of the window. */
  statusBar?: ComponentType
  /** What the right panel header says on its left (defaults to its title). */
  rightPanelHeader?: ComponentType
  /** The content of the right panel. */
  rightPanel?: ComponentType
  /** Extra items at the end of the header. */
  headerEnd?: ComponentType
  /** The area above the page, such as a ribbon. */
  aboveContent?: ComponentType
}

/** How an app describes itself to the shell. A module level constant; the
 * functions marked as hooks follow the rules of hooks. */
export type ShellConfig = {
  /** A hook, built from the app's own translations. */
  labels: () => ShellLabels
  brand: () => { product: string; office: string; crest: ReactNode }
  /** A hook, so it can depend on mode or role. */
  nav: () => NavModel
  /** A hook. Keyed by nav row id. */
  counts?: () => Record<string, { value: number; urgent?: boolean }>
  /** How many recent items to keep (default 3). Only for an app with a page that lists them. */
  maxRecents?: number
  /** The first tab, always pinned and fixed. */
  home: { key: string; kind: string; to: string; title: () => string }
  identity: {
    resolve: (location: Location) => TabIdentity | null
    icon: (tab: { kind: string; to: string }) => IconSvgElement
    /** Areas follow the language: their saved title is replaced when drawn. */
    label?: (tab: { kind: string; to: string; title: string }) => string
    /** A hook: a loaded record's own name. */
    useRecordTitle?: (identity: TabIdentity | null) => string | undefined
  }
  /** A hook. */
  search: () => { enabled: boolean; menu: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }> }
  /** A hook. */
  quickAdd: () => QuickAddItem[]
  /** The app's own drawer for a quick add form (each app owns its create panel). Needed only when an item opens a form. */
  createFrame?: ComponentType<CreateFrameProps>
  /** A hook. */
  footer: () => FooterModel
  /** Top level saved fields the app keeps for itself. */
  persistedExtras?: readonly string[]
  /** A side panel that is not locked starts closed and folds away when the person moves to another place. */
  rightPanelTemporary?: boolean
  /** 'shell' (default) draws the one right panel button in the header; 'app' leaves it to the app's own header end buttons. */
  rightToggle?: "shell" | "app"
  /** Keys the shell does not know. Return true when the app handled the key press. */
  onShortcut?: (event: KeyboardEvent) => boolean
  slots?: ShellSlots
}
