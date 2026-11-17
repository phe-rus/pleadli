import { WindowControls } from '@pleadli/ui/window-controls'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'
import { useLabels } from './context'

export type ControlsLabels = { group: string; close: string; minimize: string; maximize: string }

/** The window buttons. Tauri's window-state plugin owns size, position and
 * maximize restoration; these only observe window state and send native
 * actions. Usable outside the shell too (a sign in screen), with its own labels. */
export const DesktopControls = ({ labels, className }: { labels: ControlsLabels; className?: string }) => {
  const desktop = typeof window !== 'undefined' && isTauri()
  const [focused, setFocused] = useState(true)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!desktop) return
    const frame = getCurrentWindow()
    let disposed = false
    const stops: (() => void)[] = []
    const keep = (stop: () => void) => (disposed ? stop() : stops.push(stop))
    const syncMaximized = async () => {
      try {
        const value = await frame.isMaximized()
        if (!disposed) setMaximized(value)
      } catch {
        /* Native window state may be unavailable during teardown. */
      }
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
      labels={labels}
      onClose={() => void frame.close()}
      onMinimize={() => void frame.minimize()}
      onToggleMaximize={() => void frame.toggleMaximize()}
    />
  )
}

/** The same buttons inside the shell, labelled from the app's `labels()`. */
export const Controls = ({ className }: { className?: string }) => <DesktopControls labels={useLabels().controls} className={className} />
