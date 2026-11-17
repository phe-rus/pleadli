import type { ReactNode } from 'react'

/** The thin bar along the foot of the window. What it says is the app's own;
 * the frame is the same everywhere. */
export function StatusBarView({ children }: { children?: ReactNode }) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border/40 bg-background px-3 text-[0.6875rem] text-muted-foreground print:hidden">{children}</footer>
  )
}
