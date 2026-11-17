export type ShortcutAction =
  | { type: 'search' }
  | { type: 'close' }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'jump'; index: number }
  | { type: 'quick-add' }
  | { type: 'save' }

export type KeyLike = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }
export type ShortcutContext = { searchEnabled: boolean; searchOpen: boolean }

/** What a key press means in the shell, or null when it means nothing. Ctrl K
 * (or ⌘K) opens and closes search, and does nothing where search is off. While
 * search is open nothing else fires. Ctrl 1 to 9 jump to a tab (9 is the last). */
export function shortcutFor(event: KeyLike, context: ShortcutContext): ShortcutAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'k') return context.searchEnabled ? { type: 'search' } : null
  if (context.searchOpen) return null
  if (key === 'w') return { type: 'close' }
  if (key === 'tab') return { type: 'cycle', delta: event.shiftKey ? -1 : 1 }
  if (/^[1-9]$/.test(key)) return { type: 'jump', index: Number(key) - 1 }
  if (key === 't') return { type: 'quick-add' }
  if (key === 's') return { type: 'save' }
  return null
}

/** Which tab Ctrl 1 to 9 lands on: 9 is always the last. */
export const jumpTarget = (index: number, count: number) => (index === 8 ? count - 1 : index < count ? index : -1)
