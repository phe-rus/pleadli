import type { ReactNode } from 'react'

/** The thin bar along the foot of the window. What it says is the app's own;
 * the frame is the same everywhere. */
export function StatusBarView({ children }: { children?: ReactNode }) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-border/40 bg-background px-4 text-[0.75rem] text-muted-foreground print:hidden">{children}</footer>
  )
}
