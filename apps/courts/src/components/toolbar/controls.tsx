import { WindowControls } from '@pleadli/ui/window-controls'
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

/** Tauri's window-state plugin owns size, position and maximize restoration.
 * These controls only observe window state and dispatch native actions. */
export const Controls = ({ className }: { className?: string }) => {
    const desktop = typeof window !== 'undefined' && isTauri()
    const [focused, setFocused] = useState(true)
    const [maximized, setMaximized] = useState(false)

    useEffect(() => {
        if (!desktop) return
        const frame = getCurrentWindow()
        let disposed = false
        const stops: (() => void)[] = []
        const keep = (stop: () => void) => disposed ? stop() : stops.push(stop)
        const syncMaximized = async () => {
            try {
                const value = await frame.isMaximized()
                if (!disposed) setMaximized(value)
            } catch { /* Native window state may be unavailable during teardown. */ }
        }
        void frame.isFocused().then((value) => { if (!disposed) setFocused(value) }).catch(() => {})
        void frame.onFocusChanged(({ payload }) => setFocused(payload)).then(keep)
        void frame.onResized(() => void syncMaximized()).then(keep)
        void syncMaximized()
        return () => {
            disposed = true
            stops.forEach((stop) => stop())
        }
    }, [desktop])

    if (!desktop) return null
    const frame = getCurrentWindow()
    return (
        <WindowControls
            className={className}
            focused={focused}
            maximized={maximized}
            labels={{ group: 'Window controls', close: 'Close', minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore window' }}
            onClose={() => void frame.close()}
            onMinimize={() => void frame.minimize()}
            onToggleMaximize={() => void frame.toggleMaximize()}
        />
    )
}
