import { useEffect } from "react"

/**
 * The embedded webview's native context menu (WebView2/WebKit) always includes an "Inspect"
 * entry regardless of Tauri's own devtools cargo feature, since that's the browser engine's own
 * menu, not something Tauri controls. Suppress it, and the devtools keyboard shortcuts, in
 * production builds only, so end users can't reach devtools; dev builds are left alone since
 * they're actually useful there.
 */
export function useDisableDevtools() {
    useEffect(() => {
        if (import.meta.env.DEV) return

        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault()
        }
        const onKeyDown = (event: KeyboardEvent) => {
            const isDevtoolsShortcut =
                event.key === "F12" ||
                (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase())) ||
                (event.metaKey && event.altKey && ["I", "J", "C"].includes(event.key.toUpperCase()))
            if (isDevtoolsShortcut) {
                event.preventDefault()
            }
        }

        document.addEventListener("contextmenu", onContextMenu)
        document.addEventListener("keydown", onKeyDown)
        return () => {
            document.removeEventListener("contextmenu", onContextMenu)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [])
}