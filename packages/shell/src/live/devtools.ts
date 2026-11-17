import { useEffect } from 'react'

/**
 * The embedded webview's native context menu always includes an "Inspect" entry
 * regardless of Tauri's own devtools feature, since that is the browser engine's
 * own menu. Suppress it, and the devtools keyboard shortcuts, in release builds
 * only; development builds are left alone since devtools are useful there.
 */
export function useDisableDevtools() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const onContextMenu = (event: MouseEvent) => event.preventDefault()
    const onKeyDown = (event: KeyboardEvent) => {
      const letter = ['I', 'J', 'C'].includes(event.key.toUpperCase())
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && letter) || (event.metaKey && event.altKey && letter)) event.preventDefault()
    }
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
