import { isTauri } from '@tauri-apps/api/core'
import type { ReactNode } from 'react'

/**
 * What the app is drawn inside. In the desktop app the window itself is see
 * through, and this is the window: rounded corners and a hairline edge, the
 * way a Mac window looks, around every screen from sign-in to the files. In a
 * browser there is no window to draw, so the app simply fills the page.
 */
export function DesktopFrame({ children }: { children: ReactNode }) {
  const desktop = typeof window !== 'undefined' && isTauri()
  if (!desktop) return <div className="relative min-h-svh bg-background">{children}</div>
  return (
    <div className="relative h-svh w-full overflow-hidden rounded-[10px] bg-background ring-1 ring-black/15 ring-inset print:h-auto print:overflow-visible print:rounded-none print:ring-0 dark:ring-white/15">
      {children}
    </div>
  )
}
