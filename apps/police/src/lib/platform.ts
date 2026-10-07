/** Where the app is running, for the few things that differ: the shortcut key
 * a Mac calls ⌘ and Windows and Linux call Ctrl. The same screens run in the
 * desktop window and in a browser; nothing else should branch on this. */
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export const shortcut = (key: string) => (isMac() ? `⌘${key}` : `Ctrl ${key}`)
