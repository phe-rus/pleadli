import { isTauri } from '@tauri-apps/api/core'

/** Copies text to the clipboard: through the desktop plugin in the app, the
 * browser's own in development. Returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeText(text)
    } else {
      await navigator.clipboard.writeText(text)
    }
    return true
  } catch {
    return false
  }
}
