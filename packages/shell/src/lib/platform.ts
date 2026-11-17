/** Where the app is running, for the few things that differ: the shortcut key
 * a Mac calls ⌘ and Windows and Linux call Ctrl. */
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export const shortcut = (key: string) => (isMac() ? `⌘${key}` : `Ctrl ${key}`)
