import type { ReactNode } from 'react'

/**
 * What the app is drawn inside. In the desktop app the window itself is see
 * through, and this is the window: rounded corners and a hairline edge, the
 * way a Mac window looks, around every screen from sign-in to the files. In a
 * browser the same fixed frame provides a faithful workspace preview.
 */
export function DesktopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-svh min-h-0 w-full flex-col overflow-hidden shell-window bg-background ring-1 ring-black/15 ring-inset print:h-auto print:overflow-visible print:rounded-none print:ring-0 dark:ring-white/15">
      {children}
    </div>
  )
}
